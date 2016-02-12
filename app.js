"use strict";

var request = require('request');

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

var self = module.exports = {

	init: function(){

		this.listenToSpeech();


		// Homey.manager('flow').trigger('downloaded');
		// Homey.manager('flow').trigger('snatched');
		// Homey.manager('flow').trigger('added');
		this.listenToTriggers();

		// Register initial webhook
		if (Homey.settings.url && Homey.settings.id && Homey.settings.secret) {
			self.registerWebhook(Homey.settings);
		}

	},


	/**
	 * Listen to speech events
	 */
	listenToSpeech: function(){

		Homey.manager('speech').on('speech', function(speech) {

			// Trigger leds while searching here

			// loop all triggers
			speech.triggers.forEach(function(trigger){
				// trigger.id == download, add
				if(['download', 'add'].indexOf(trigger.id) > -1){
					self.doSearch(movie_name)
						.then(self.doConfirmResult.bind(self))
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

		Homey.manager.on('trigger.couchpotato_webhook', function(args, callback){

			var event = args.event;

			if(event == 'added'){
				Homey.manager('speech-output').say( __("%m added to watchlist") );
			}
			else if (event == 'snatched'){
				Homey.manager('speech-output').say( __("%m snatched") );
			}
			else if (event == 'downloaded'){
				Homey.manager('speech-output').say( __("%m downloaded") );
			}

		});

	},

	/**
	 * When updating settings, re-register the webhook
	 */
	updateSettings: function(settings, callback){
		self.registerWebhook(settings, callback);
	},

	/**
	 * Register webhook
	 */
	registerWebhook: function(settings, callback){

		Homey.manager('cloud').registerWebhook(
			settings.id,
			settings.secret,
			{},
			self.incomingWebhook,
			function (err, result){
				if (err || !result){

					// Return failure
					if(callback)
						callback(null, false);
				}
				else {
					// Unregister old webhook
					if(webhook_id && webhook_id !== settings.id)
						Homey.manager('cloud').unregisterWebhook(webhook_id);

					// Return success
					if(callback)
						callback(null, true);
				}
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

		// Trigger event
		Homey.manager('flow').trigger('couchpotato_webhook', {
			event: args.body.event
		});

	},

	doSearch: function(q){

		return self.request('search.movie', {
			'q': q,
			'type': 'movie'
		});

	},

	doConfirmResult: function(){

	},

	doAdd: function(){

	},

	doCheckWatchlist: function(){

	},

	doCheckCollection: function(){

	},

	/**
	 * Request the CouchPotato api
	 * @param endpoint
	 * @param args
	 * @param callback
	 */
	request: function(endpoint, args){
		var url = Homey.settings.api_url + '/api/' + Homey.settings.api_key + '/' + endpoint;
			url += '?' + self.requestSerialize(args);

		return request.get({
			url: url
		}).on('data', function(data) {
			callback(data);
		});

	},

	/**
	 * Object to querystring
	 * @param obj
	 * @returns {string}
	 */
	requestSerialize: function(obj) {
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

};
