"use strict";

var request = require('request-promise');
var Base = require('./base.js');

var webhook_id;

/**
 *
 * Support planned:
 * __Download__ "movie title" __in the best quality__
 * __Download__ "movie title" __in HD quality__
 * __Do I have__ "movie title" __in my watchlist__?
 * __Do I have__ "movie title" __in my collection__?
 * __Search for all wanted movies__
 *
 */

var debug = false;
var log = function(message){
	if(debug){
		Homey.log('Saying: ' + message)
	}
	else {
		Homey.manager('speech-output').say(message);
	}
};

var App = Base.extend({

	constructor: function(){
		this.updateSettings();
		this.listenToSettingsChange();
		this.listenToSpeech();
		this.listenToActions();
	},

	/**
	 * Listen to speech events
	 */
	listenToSpeech: function(){
		var self = this;
		Homey.log('listenToSpeech');

		Homey.manager('speech-input').on('speech', function(speech) {
			Homey.log(speech);

			Homey.log(Homey.manager('settings').get('use_default'));
			if(!Homey.manager('settings').get('use_default')) return;

			// Trigger leds while searching here

			// loop all triggers
			speech.triggers.forEach(function(trigger){
				// trigger.id == download, add
				if(['download', 'add'].indexOf(trigger.id) > -1){
					var movie_name = speech.transcript.substring(trigger.position + trigger.text.length);
					Homey.log(movie_name);
					self.searchAndAdd(movie_name);
				}
				else if(['to_watchlist'].indexOf(trigger.id) > -1){
					self.askAndAdd();
				}

				// trigger.id == watchlist

				// trigger.id == do i have
				// Search library and give answer "yeah, in HD quality", "no, add it?"
				// Allow answering to add it

			});

		});
	},

	/**
	 * Listen to settings
	 */
	listenToSettingsChange: function(){
		var self = this;
		Homey.log('listenToSettingsChange');

		Homey.manager('settings').on('set', function(){
			self.updateSettings();
		});

	},

	/**
	 * Listen to actions
	 */
	listenToActions: function(){
		var self = this;

		// Search for all movies in the wanted list
		Homey.manager('flow').on('action.search_all', function(callback){
			self.request('movie.searcher.full_search')
				.then(function(){
					log(__('messages.search_all_wanted'));
					callback(null, true);
				});
		});

		// Ask what movie the user wants added
		Homey.manager('flow').on('action.ask', function(callback, args){
			Homey.log('action.ask', args);
			self.askAndAdd();
			callback(null, true);
		});

		// Filter out words before adding
		Homey.manager('flow').on('action.filter_and_add', function(callback, args){
			Homey.log('action.filter_and_add', args);

			self.doFilter(args)
				.then(function(movie_name){
					Homey.log(movie_name);
					self.searchAndAdd(movie_name);
					callback(null, true);
				})
				.catch(function(){
					callback(true, false);
				})
		});
	},

	/**
	 * When updating settings, re-register the webhook
	 */
	updateSettings: function(){
		Homey.log('updateSettings');

		// Register initial webhook
		this.registerWebhook();
	},

	/**
	 * Register webhook
	 */
	registerWebhook: function(){
		var self = this;
		Homey.log('registerWebhook');

		var url = Homey.manager('settings').get('webhook_url'),
			id = Homey.manager('settings').get('webhook_id'),
			secret = Homey.manager('settings').get('webhook_secret');

		// Unregister if changed
		if(webhook_id && webhook_id != id) Homey.manager('cloud').unregisterWebhook(webhook_id);

		// Don't register if not all values are set
		if(!url || !id || !secret) return;

		Homey.manager('cloud').registerWebhook(
			id,
			secret,
			{},
			self.incomingWebhook,
			function(){}
		);

		// Store used webhook internally
		webhook_id = id;
	},

	/**
	 * Catch incoming webhook
	 * @param args
	 */
	incomingWebhook: function(args){
		Homey.log('incomingWebhook: ', args.body.type);

		var message = args.body.message,
			type = args.body.type,
			movie = args.body.movie;

		if (type == 'movie.snatched'){
			Homey.manager('flow').trigger('snatched', {
				movie: movie
			});
		}
		else if (type == 'renamer.after'){
			Homey.manager('flow').trigger('downloaded', {
				movie: movie
			});
		}
		else if (type == 'media.available'){
			Homey.manager('flow').trigger('dashboard', {
				movie: movie
			});
		}
		else if (type == 'test'){
			log(message);
		}

	},

	doSearch: function(q){
		Homey.log('Search for: ' + q);

		return this.request('search', {
			q: q,
			type: 'movie',
			limit: 1
		});
	},

	searchAndAdd: function(movie_name){
		var self = this;

		return self.doSearch(movie_name)
			.then(self.doConfirmResult.bind(self))
			.catch(function(err){ Homey.log(err); })
			.then(self.doAdd.bind(self));
	},

	doAsk: function(){
		Homey.log('doAsk');

		return new Promise(function(resolve, reject){
			Homey.manager( 'speech-input').ask(__('messages.what_movie?'), function(err, result){
				Homey.log('doAsk results', err, result);
				if(result){
					resolve(result);
				}
				else {
					reject();
				}

			});
		});

	},

	askAndAdd: function(){
		var self = this;
		return self.doAsk()
			.then(function(movie_name){
				return self.doSearch(movie_name)
			})
			.catch(function(){
				log(__('messages.sorry_couldnt_add'));
			})
			.then(self.doConfirmResult.bind(self))
			.catch(function(err){ Homey.log(err); })
			.then(self.doAdd.bind(self));
	},

	doFilter: function(args){
		Homey.log('doFilter');

		return new Promise(function(resolve){
			var remove = (args.remove || '').toLowerCase().split(' '),
				sentence = (args.droptoken || '').toLowerCase().split(' ');

			var movie_name = sentence.filter(function(item) {
				return remove.indexOf(item) === -1;
			}).join(' ');

			resolve(movie_name);
		});
	},

	doConfirmResult: function(data){
		Homey.log('doConfirmResult');

		if(data && data.movies && data.movies.length > 0){
			var movie = data.movies[0];

			return new Promise(function(resolve, reject){
				if(Homey.manager('settings').get('skip_confirm')){
					resolve(movie);
				}
				else {
					var question = __('messages.confirm', {'title': movie.original_title});

					Homey.manager( 'speech-input').confirm(question, function(err, confirmed){
						//var confirmed = true;

						Homey.log('Adding ' + movie.original_title + ': ' + confirmed );
						if(confirmed){
							resolve(movie);
						}
						else {
							reject(__('messages.not_adding'));
						}

					});
				}
			});
		}
		else {
			throw 'Can\'t find anything';
		}

	},

	doAdd: function(movie){
		Homey.manager('flow').trigger('added', {
			movie: movie.original_title
		});

		return this.request('movie.add', {
			identifier: movie.imdb
		});
	},

	//doCheckWatchlist: function(){
	//	Homey.log('doCheckWatchlist');
	//},
	//
	//doCheckCollection: function(){
	//	Homey.log('doCheckCollection');
	//},

	/**
	 * Request the CouchPotato api
	 * @param endpoint
	 * @param args
	 * @param callback
	 */
	request: function(endpoint, args){
		Homey.log('request');

		var host = Homey.manager('settings').get('host'),
			api = Homey.manager('settings').get('api');

		var url = host + '/api/' + api + '/' + endpoint;
			url += '?' + this.requestSerialize(args);

		Homey.log(url);

		return request.get({
			url: url,
			json: true
		});

	},

	/**
	 * Object to querystring
	 * @param obj
	 * @returns {string}
	 */
	requestSerialize: function(obj) {
		Homey.log('requestSerialize');

		var str = [];
		for(var p in obj) {
			if (obj.hasOwnProperty(p)) {
				var v = obj[p];
				str.push(typeof v == 'object' ?
					serialize(v, p) :
				encodeURIComponent(p) + "=" + encodeURIComponent(v));
			}
		}
		return str.join("&");
	}

});

module.exports.init = function(){
	new App();
};
