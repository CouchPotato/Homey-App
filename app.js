"use strict";

var request = require('request-promise');
var Base = require('./base.js');

var webhook_id;

/**
 *
 * Supported:
 * __Download__ "movie title" __in the best quality__
 * __Download__ "movie title" __in HD quality__
 * __Do I have__ "movie title" __in my watchlist__?
 * __Do I have__ "movie title" __in my collection__?
 * __Search for all wanted movies__
 *
 */

var App = Base.extend({

	constructor: function(){
		Homey.log('constructor');

		this.updateSettings();
		this.listenToSpeech();
		this.listenToTriggers();

	},

	/**
	 * Listen to speech events
	 */
	listenToSpeech: function(){
		Homey.log('listenToSpeech');

		var self = this;

		Homey.manager('speech-input').on('speech', function(speech) {
			Homey.log(speech);

			// Trigger leds while searching here

			// loop all triggers
			speech.triggers.forEach(function(trigger){
				Homey.log(trigger);

				// trigger.id == download, add
				if(['download', 'add'].indexOf(trigger.id) > -1){
					var movie_name = speech.transcript.substring(trigger.position + trigger.text.length);
					Homey.log(movie_name);
					self.doSearch(movie_name)
						.then(self.doConfirmResult.bind(self))
						.catch(function(err){ Homey.log(err); })
						.then(self.doAdd.bind(self));
				}
				else if(['watchlist'].indexOf(trigger.id) > -1){

				}

				// trigger.id == watchlist

				// trigger.id == do i have
				// Search library and give answer "yeah, in HD quality", "no, add it?"
				// Allow answering to add it

			});

			// Found results, download first hit (or list movies and let user choose?)

		});
	},

	/**
	 * Listen to webhook and fire events based on incoming data
	 */
	listenToTriggers: function(){
		Homey.log('listenToTriggers');
		var self = this;

		Homey.manager('settings').on('set', function(name){
			self.updateSettings();
		});

		Homey.on('trigger.couchpotato_webhook', function(args, callback){

			var event = args.event;

			if (event == 'snatched'){
				//Homey.manager('speech-output').say( __("%m snatched") );
				Homey.manager('flow').trigger('snatched', {
					movie: movie.original_title
				});

			}
			else if (event == 'downloaded'){
				//Homey.manager('speech-output').say( __("%m downloaded") );
				Homey.manager('flow').trigger('snatched', {
					movie: movie.original_title
				});
			}

		});

	},

	/**
	 * When updating settings, re-register the webhook
	 */
	updateSettings: function(settings, callback){
		Homey.log('updateSettings');
		var self = this;


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

		if(!url || !id || !secret) return;

		Homey.manager('cloud').registerWebhook(
			id,
			secret,
			{},
			self.incomingWebhook,
			function (err, result){
				//if (err || !result){
				//
				//	// Return failure
				//	if(callback)
				//		callback(null, false);
				//}
				//else {
				//	// Unregister old webhook
				//	if(webhook_id && webhook_id !== settings.id)
				//		Homey.manager('cloud').unregisterWebhook(webhook_id);
				//
				//	// Return success
				//	if(callback)
				//		callback(null, true);
				//}
			}
		);

		// Store used webhook internally
		webhook_id = settings.id;
	},

	/**
	 * Catch incoming webhook
	 * @param args
	 */
	incomingWebhook: function(args){
		Homey.log('incomingWebhook: ', args);

		// Trigger event
		Homey.manager('flow').trigger('couchpotato_webhook', {
			event: args.body.event
		});

	},

	doSearch: function(q, callback){
		Homey.log('Search for: ' + q);

		return this.request('search', {
			q: q,
			type: 'movie',
			limit: 1
		});

	},

	doConfirmResult: function(data){
		Homey.log('doConfirmResult');
		Homey.log(arguments);

		if(data && data.movies && data.movies.length > 0){
			var movie = data.movies[0];

			var question = __('Do you want me to add %m to your wanted list?').replace(/%m/g, movie.original_title);

			return new Promise(function(resolve, reject){
				//Homey.manager( 'speech-input').confirm(question, function(err, confirmed){
					var confirmed = true;

					Homey.log('Adding ' + movie.original_title + ': ' + confirmed );
					if(confirmed){
						return resolve(movie);
					}
					else {
						Homey.manager('speech-output').say(__('Not adding it.'));
						return reject();
					}

				//});
			});
		}
		else {
			Homey.manager('speech-output').say(__('Sorry, couldn\'t find anything'));
			return new OperationalError('Can\'t find anything');
		}

	},

	doAdd: function(movie){

		var say = __('Adding %m').replace(/%m/g, movie.original_title);
		Homey.manager('flow').trigger('added', {
			movie: movie.original_title
		});
		Homey.log(say);
		//Homey.manager('speech-output').say(say);

		return this.request('movie.add', {
			identifier: movie.imdb
		});
	},

	doCheckWatchlist: function(){
		Homey.log('doCheckWatchlist');

	},

	doCheckCollection: function(){
		Homey.log('doCheckCollection');

	},

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
