"use strict";

function App()
{

}

App.prototype.init = function(){

	// __Download__ "movie title" __in the best quality__
	// __Download__ "movie title" __in HD quality__
	// __Do I have__ "movie title" __in my watchlist__?
	// __Do I have__ "movie title" __in my collection__?
	Homey.manager('speech').on('speech', function( speech ) {

		// Trigger leds while searching here

		// loop all triggers
		speech.triggers.forEach(function(trigger){
			// trigger.id == download, add

			// trigger.id == watchlist

			// trigger.id == do i have
			// Search library and give answer "yeah, in HD quality", "no, add it?"
			// Allow answering to add it

		});

		// Found results, download first hit (or list movies and let user choose?)

	});


	// Homey.manager('flow').trigger('downloaded');
	// Homey.manager('flow').trigger('snatched');
	// Homey.manager('flow').trigger('added');

	Homey.manager.on('trigger.added', function(){
		Homey.manager('speech-output').say( __("%m added to watchlist") );
	})

	Homey.manager.on('trigger.snatched', function(){

		Homey.manager('speech-output').say( __("%m snatched") );

	})

	Homey.manager.on('trigger.downloaded', function(){

		Homey.manager('speech-output').say( __("%m downloaded") );
	})


};

module.exports = App;
