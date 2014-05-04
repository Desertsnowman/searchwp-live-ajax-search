(function($){
	var plugin_name = "searchwp_live_search";

	function SearchwpLiveSearch( element ) {
		// this config may be overwritten via data attribute on the element to match a global variable with the same structure
		this.config = {
			engine: 'default',			// SearchWP Engine to use (if applicable)
			input: {
				delay: 500,				// wait 500ms before performing search
				min_chars: 3 			// wait for at least 3 characters before performing search
			},
			results: {
				position: 'bottom',		// position (bottom|top)
				width: 'auto', 			// match the width of the search field (auto|css)
				offset: {				// results wrapper offset
					x: 0,
					y: 5
				}
			},
			spinner: {					// uses http://fgnass.github.io/spin.js/
				lines: 10, 				// number of lines to draw
				length: 8,  			// length of each line
				width: 4,   			// line thickness
				radius: 8,      		// radius of the inner circle
				corners: 1, 			// corner roundness (0..1)
				rotate: 0, 				// rotation offset
				direction: 1, 			// 1: clockwise, -1: counterclockwise
				color: '#000', 			// #rgb or #rrggbb or array of colors
				speed: 1, 				// rounds per second
				trail: 60, 				// afterglow percentage
				shadow: false, 			// whether to render a shadow
				hwaccel: false, 		// whether to use hardware acceleration
				className: 'spinner', 	// CSS class to assign to the spinner
				zIndex: 2e9, 			// z-index (defaults to 2000000000)
				top: '50%', 			// top position relative to parent
				left: '50%'  			// left position relative to parent
			}
		};

		// internal properties
		this.input_el = element;		// the input element itself
		this.results_id = null;			// the id attribute of the results wrapper for this search field
		this.results_el = null;			// the results wrapper element itself
		this.results_showing = false;	// whether the results are showing
		this.form_el = null;			// the search form element itself
		this.timer = false;				// powers the delay check
		this.last_string = '';			// the last search string submitted
		this.spinner = null;			// the spinner
		this.spinner_showing = false;	// whether the spinner is showing
		this.has_results = false;		// whether results are showing

		// kick it off
		this.init();
	}

	SearchwpLiveSearch.prototype = {

		// prep the field and form
		init: function(){

			var self = this,
				$input = this.input_el;
			this.form_el = $input.parents('form:eq(0)');

			// our results wrapper needs an ID since we're appending it to the <body> so as to avoid
			// potential z-index or overflow:hidden issues, making sure it's visible
			this.results_id = this.uniqid('swplive');

			// allow developers to override the config based on the value of the swplive data attribute
			// that kicked everything off, the value of that attribute must match a global var and
			// it is the responsibility of the developer to ensure all properties are in place
			var config_template = $input.data('swpconfig');
			if('default' !== config_template && typeof config_template !== 'undefined') {
				this.config = window[config_template];
			}

			// allow the swpengine data attribute to override the engine being used
			var engine = $input.data('swpengine');
			if( engine ) {
				this.config.engine = engine;
			}

			// prevent autocomplete
			$input.attr('autocomplete','off');

			// set up and position the results container
			$('body').append($('<div class="searchwp-live-search-results" id="' + this.results_id + '"></div>'));
			this.results_el = $('#'+this.results_id);
			this.position_results();
			$(window).resize(function(){
				self.position_results();
			});

			// prep the spinner
			if(this.config.spinner){
				this.spinner = new Spinner(this.config.spinner);
			}

			// bind to keyup
			$input.keyup(function(){
				// if the user typed, show the results wrapper and spinner
				if(self.input_el.val().length&&!self.results_showing){
					self.position_results();
					self.results_el.addClass('searchwp-live-search-results-showing');
					self.show_spinner();
					self.results_showing = true;
				}
				// if there are already results on display and the user is changing the search string
				// remove the existing results and show the spinner
				if(self.has_results && !self.spinner_showing && self.last_string !== $.trim(self.input_el.val())){
					self.results_el.empty();
					self.show_spinner();
				}
			}).keyup($.proxy(this.maybe_search, this));

			// destroy the results when input focus is lost
			$('html').click(function(){
				self.destroy_results();
			});
			$input.click(function(e){
				e.stopPropagation();
			});
			this.results_el.click(function(e){
				e.stopPropagation();
			});
		},

		position_results: function(){
			var $input = this.input_el,
				input_offset = $input.offset(),
				$results = this.results_el,
				results_top_offset = 0;

			// check for an offset
			input_offset.left += parseInt(this.config.results.offset.x,10);
			input_offset.top += parseInt(this.config.results.offset.y,10);

			// position the results container
			switch(this.config.results.position){
				case 'top':
					results_top_offset = $results.height();
					break;
				default:
					results_top_offset = $input.outerHeight();
			}

			// apply the offset and finalize the position
			$results.css('left',input_offset.left);
			$results.css('top', ( input_offset.top + results_top_offset ) + 'px');
			if('auto'===this.config.results.width){
				$results.width($input.outerWidth()-parseInt($results.css('paddingRight').replace('px',''),10)-parseInt($results.css('paddingLeft').replace('px',''),10));
			}
		},

		destroy_results: function(e){
			this.input_el.val('');
			this.spinner.stop();
			this.results_el.empty().removeClass('searchwp-live-search-results-showing');
			this.results_showing = false;
			this.has_results = false;
		},

		// if the search value changed, we've waited long enough, and we have at least the minimum characters: search!
		maybe_search: function(e){
			clearTimeout(this.timer);
			if(this.last_string !== $.trim(e.currentTarget.value) && e.currentTarget.value.length >= this.config.input.min_chars){
				this.timer = setTimeout(
					$.proxy(this.search, this, e),
					this.config.input.delay
				);
			}
		},

		show_spinner: function(){
			if(this.config.spinner&&!this.spinner_showing){
				this.spinner.spin(document.getElementById(this.results_id));
				this.spinner_showing = true;
			}
		},

		hide_spinner: function(){
			if(this.config.spinner){
				this.spinner.stop();
				this.spinner_showing = false;
			}
		},

		// perform the search
		search: function(e){
			var self = this,
				$form = this.form_el,
				values = $form.serialize(),
				action = $form.attr('action'),
				$input = this.input_el,
				$results = this.results_el;

			// append our action, engine, and (redundant) query (so as to save the trouble of finding it again server side)
			values += '&action=searchwp_live_search&swpengine=' + this.config.engine + '&swpquery=' + $input.val();

			if(action.indexOf('?') !== -1){
				action = action.split('?');
				values += '&' + action[1];
			}

			// return if there were no results
			// TODO: figure out how to make this work
			if( $results.find('.searchwp-live-search-not-found').length && $input.val().indexOf(this.last_string) !== -1 ) {
				return;
			}

			this.last_string = $input.val();
			this.has_results = true;

			$.ajax({
				url: searchwp_live_search_params.ajaxurl,
				type: "POST",
				data: values,
				complete: function(){
					self.spinner_showing = false;
					self.hide_spinner();
				},
				success: function(response){
					if(response === 0){
						response = "";
					}
					self.position_results();
					$results.html(response);

				}
			});
		},

		uniqid: function(prefix, more_entropy) {
			// +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
			// +    revised by: Kankrelune (http://www.webfaktory.info/)
			// %        note 1: Uses an internal counter (in php_js global) to avoid collision
			// *     example 1: uniqid();
			// *     returns 1: 'a30285b160c14'
			// *     example 2: uniqid('foo');
			// *     returns 2: 'fooa30285b1cd361'
			// *     example 3: uniqid('bar', true);
			// *     returns 3: 'bara20285b23dfd1.31879087'
			if (typeof prefix === 'undefined') {
				prefix = "";
			}

			var retId;
			var formatSeed = function (seed, reqWidth) {
				seed = parseInt(seed, 10).toString(16); // to hex str
				if (reqWidth < seed.length) { // so long we split
					return seed.slice(seed.length - reqWidth);
				}
				if (reqWidth > seed.length) { // so short we pad
					return new Array(1 + (reqWidth - seed.length)).join('0') + seed;
				}
				return seed;
			};

			// BEGIN REDUNDANT
			if (!this.php_js) {
				this.php_js = {};
			}
			// END REDUNDANT
			if (!this.php_js.uniqidSeed) { // init seed with big random int
				this.php_js.uniqidSeed = Math.floor(Math.random() * 0x75bcd15);
			}
			this.php_js.uniqidSeed++;

			retId = prefix; // start with prefix, add current milliseconds hex string
			retId += formatSeed(parseInt(new Date().getTime() / 1000, 10), 8);
			retId += formatSeed(this.php_js.uniqidSeed, 5); // add seed hex string
			if (more_entropy) {
				// for more entropy we add a float lower to 10
				retId += (Math.random() * 10).toFixed(8).toString();
			}

			return retId;
		}
	};

	$.fn[plugin_name] = function(options){
		this.each(function(){
			if(!$.data(this, "plugin_" + plugin_name)){
				$.data(this, "plugin_" + plugin_name, new SearchwpLiveSearch($(this), options));
			}
		});

		// chain jQuery functions
		return this;
	};
})(jQuery);

// find all applicable SearchWP Live Search inputs and bind them
jQuery(document).ready(function($){
	$('input[data-swplive]').searchwp_live_search();
});
