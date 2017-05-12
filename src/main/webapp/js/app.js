/** @public */
window.nyc = window.nyc || {};

/**
 * @desc A class to manage user interaction with the hurricane map
 * @public
 * @class
 * @constructor
 * @param {ol.Map} map The OpenLayers map for the hurricane map
 * @param {Object} featureDecorations Decorations for the evacuation zone and evacuation center features
 * @param {nyc.Content} content Manages content messages
 * @param {nyc.Style} style Styles layers
 * @param {nyc.LocationMgr} locationMgr Locates using geolocation and geocoding
 * @param {nyc.Directions} directions Generates directions using Google Maps
 * @param {nyc.ol.Popup} popup Popup for displaying feature information on map click
 */
nyc.App = function(map, featureDecorations, content, style, locationMgr, directions, popup){
	var me = this;
	me.map = map;
	me.content = content;
	me.view = map.getView();
	me.directions = directions;
	me.popup = popup;
	me.location = {};
	me.zoneOrders = {};
	me.tips = [];
	
	$('#btn-view-map, #btn-view-map *').click(function(){
		$('#splash').fadeOut();
		me.layout();
	});
	$('#copyright').html(content.message('copyright', {yr: new Date().getFullYear()}));
	
	me.getOrders(me.ordersUrl());
	
	me.zoneSource = new nyc.ol.source.Decorating(
		{url: 'zone.json', format: new ol.format.TopoJSON},
		[content, {orders: me.zoneOrders}, featureDecorations.zone.fieldAccessors, featureDecorations.zone.htmlRenderer]
	);
	me.zoneSource.on(nyc.ol.source.Decorating.LoaderEventType.FEATURESLOADED, $.proxy(me.ready, me));
	me.zoneSource.on(nyc.ol.source.Decorating.LoaderEventType.FEATURELOADERROR, $.proxy(me.error, me));
	me.zoneLayer = new ol.layer.Vector({
		source: me.zoneSource,
		style: $.proxy(style.zoneStyle, style),
		opacity: 0.65
	});
	map.addLayer(me.zoneLayer);
	me.tips.push(
		new nyc.ol.FeatureTip(map, [{layer: me.zoneLayer, labelFunction: me.zoneTip}])
	);

	me.centerSource = new nyc.ol.source.FilteringAndSorting(
		{url: 'center.json', format: new ol.format.TopoJSON()},
		[content, featureDecorations.center.fieldAccessors, featureDecorations.center.htmlRenderer]
	);
	me.centerSource.on(nyc.ol.source.Decorating.LoaderEventType.FEATURELOADERROR, $.proxy(me.error, me));
	me.centerLayer = new ol.layer.Vector({
		source: me.centerSource,
		style: $.proxy(style.centerStyle, style)
	});
	map.addLayer(me.centerLayer);
	me.tips.push(
		new nyc.ol.FeatureTip(map, [{layer: me.centerLayer, labelFunction: me.centerTip}])
	);
	
	$('#panel, .banner, .ctl').hover($.proxy(me.hideTips, me));

	$('#filter input').click($.proxy(me.filter, me));
		
	locationMgr.on(nyc.Locate.EventType.GEOCODE, $.proxy(me.located, me));
	locationMgr.on(nyc.Locate.EventType.GEOLOCATION, $.proxy(me.located, me));
		
	directions.on(nyc.Directions.EventType.CHANGED, function(){
		var msg = content.message('trip_planner'), node = $('#directions div.adp div.adp-agencies');
		if (node.length && node.html().indexOf(msg) == -1){
			node.prepend(msg);			
		}
	});

	directions.on(nyc.Directions.EventType.NO_DIRECTIONS, function(event){
		var req = event.response.request;
		req.travelMode = req.travelMode.toLowerCase(); 
		me.alert(content.message('no_directions', req));
		$('#directions div.adp div.adp-agencies').prepend(content.message('trip_planner'))			
	});

	map.on('click', $.proxy(me.mapClick, me));
	
	$('#transparency').attr('type', ''); //removes up/down arrows from input in ff
	$('#transparency').change($.proxy(me.transparency, me));
	
	$('#map-tab-btn a').click($.proxy(me.mapSize, me));
	
	$('a, button').each(function(_, n){
		if ($(n).attr('onclick')){
			$(n).bind('tap', function(){
				$(n).trigger('click');
			});
		}
	});
	
	$(window).on('resize orientationchange', function(){
		if ($('#dir-page').css('display') == 'block'){
			if ($('#dir-map').width() < $(window).width()){
				$('#dir-panel').show();
			}
		}
	});
	$('body').pagecontainer({change: $.proxy(me.layout, me)});

	/* make available to screen reader in links list */
	$('a, button').attr('role', 'link'); 
};
	
nyc.App.prototype = {
	/** 
	 * @private
	 * @member {ol.Map}
	 */
	map: null,
	/** 
	 * @private
	 * @member {ol.View}
	 */
	view: null,
	/** 
	 * @private
	 * @member {nyc.ol.source.Decorating}
	 */
	zoneSource: null,
	/** 
	 * @private
	 * @member {ol.layer.Vector}
	 */
	zoneLayer: null,
	/** 
	 * @private
	 * @member {nyc.ol.source.FilteringAndSorting}
	 */
	centerSource: null,
	/** 
	 * @private
	 * @member {ol.layer.Vector}
	 */
	centerLayer: null,
	/** 
	 * @private
	 * @member {nyc.ol.source.Decorating}
	 */
	locationSource: null,
	/** @private */
	content: null,
	/** 
	 * @private
	 * @member {nyc.Content}
	 */
	controls: null,
	/** 
	 * @private
	 * @member {nyc.Directions}
	 */
	directions: null,
	/** 
	 * @private
	 * @member {nyc.ol.Popup}
	 */
	popup: null,
	/** 
	 * @private
	 * @member {Array<nyc.ol.FeatureTip>}
	 */
	tips: null,
	/** 
	 * @private
	 * @member {nyc.Locate.Result}
	 */
	location: null,
	/** 
	 * @private
	 * @member {Object<number, boolean>}
	 */
	zoneOrders: null,
	/** 
	 * @private
	 * @member {nyc.Dialog}
	 */
	dialog: null,
	/** 
	 * @desc Initializes the list of evacuation centers
	 * @public 
	 * @method
	 */
	initList: function(){
		if (!$('#centers-list div').length){
			this.list(this.location.coordinates);
			setTimeout(this.listHeight, 10);
		}
	},
	/** 
	 * @desc Set up page layout
	 * @public 
	 * @method
	 */
	layout: function(){
		var mobile = $('#panel').width() == $(window).width();
		$(window).one('resize', $.proxy(this.layout, this));
		$('#tabs').tabs({
			activate: function(event, ui){
				$('#map-page .ui-content').css(
					'z-index', 
					mobile && ui.newPanel.attr('id') == 'map-tab' ? '1000' : 'auto'
				);
			}
		});
		if (!this.zoneSource.isXhrFeaturesLoaded()){
			$('#first-load').data('reloaded', true);
			$('#first-load').show();
		}
		$('#tabs li a').removeClass('ui-btn-active');
		if (mobile){
			$('#map-tab-btn').show();
			$('#tabs').tabs('refresh').tabs({active: 0});
			$('#map-tab-btn a').addClass('ui-btn-active');
		}else{
			$('#map-tab-btn').hide();
			$('#tabs').tabs('refresh').tabs({active: 1});
			$('#centers-tab-btn a').addClass('ui-btn-active');
		}
		this.initList();
		this.map.updateSize();
		this.listHeight();
	},
	/**
	 * @desc Zoom to the location of an evacuation center
	 * @public
	 * @method
	 * @param {string} id The id of the evacuation center feature
	 */
	zoomFacility: function(id){
		var me = this, feature = me.centerSource.getFeatureById(id);
		if ($('#panel').width() == $(window).width()){
			$('#tabs').tabs({active: 0});
			$('#tabs li a').removeClass('ui-btn-active');
			$('#map-tab-btn a').addClass('ui-btn-active');
		}
		me.zoomCoords(feature.getCoordinates());
		me.map.once('moveend', function(){
			me.showPopup(feature.getCoordinates(), feature.html('inf-pop'))
		});
	},
	/**
	 * @desc Display directions to an evacuation center
	 * @public
	 * @method
	 * @param {string} id The id of the evacuation center feature
	 */
	direct: function(id){
		var me = this,
			feature = me.centerSource.getFeatureById(id),
			to = feature.getAddress(),
			name = feature.getName(),
			from = me.location.name || '';
		
		$('body').pagecontainer('change', $('#dir-page'), {transition: 'slideup'});
		if (me.lastDir != from + '|' + to){
			var args = {from: unescape(from), to: unescape(to), facility: unescape(name)};
			me.lastDir = from + '|' + to;
			me.directions.directions(args);
		}
	},
	/** 
	 * @desc Toggle the display of accessibility info
	 * @public 
	 * @method
	 * @param {Object} event The click event of toggle button
	 */
	access: function(event){
		var me = this, parent = $(event.target).parent();
		parent.next().slideToggle(function(){
			if (parent.parent().hasClass('inf-pop')) {
				me.popup.pan();
			}				
		});
	},
	/** 
	 * @private 
	 * @method
	 */
	ready: function(){
		if ($('#first-load').data('reloaded'))
			$('#first-load').fadeOut();
	},
	/**
	 * @private
	 * @method
	 * @param {nyc.Locate.Result} data
	 */
	located: function(data){
		this.list(data.coordinates);
		this.location = data;
		this.zone();
	},
	/** 
	 * @private 
	 * @method
	 */
	mapSize: function(){
		var map = this.map;
		setTimeout(function(){map.updateSize();}, 10);
	},
	/** 
	 * @private 
	 * @method
	 * @return {boolean}
	 */
	isMobile: function(){
		return navigator.userAgent.match(/(iPad|iPhone|iPod|iOS|Android)/g);
	},
	/** 
	 * @private 
	 * @method
	 * @param {ol.Coordinate} coordinates
	 */
	list: function(coordinates){
		var container = $('#centers-list'); 
		container.empty();
		$.each(this.centerSource.sort(coordinates), function(i, facility){
			var info = $(facility.html('inf-list'));
			info.attr('role', 'listitem');
			if (i % 2 == 0) info.addClass('even-row');
			$(container).append(info).trigger('create');
		});
		if (this.isMobile()){
			container.find('a, button').each(function(_, n){
				if ($(n).attr('onclick')){
					$(n).bind('tap', function(){
						$(n).trigger('click');
					});
				}
			});				
		}			
		/* make available to screen reader in links list */
		$('#centers-list a').attr('role', 'link'); 
		this.listHeight();
	},
	/** 
	 * @private 
	 * @method
	 */
	listHeight: function(){
		$('#centers-tab .centers-bottom').height(
			$('#centers-tab').height() - $('#centers-tab .centers-top').height() - $('#copyright').height() - 5
		);
	},
	/** 
	 * @private 
	 * @method
	 */
	transparency: function(){
		var opacity = (100 - $('#transparency').val()) / 100;
		this.zoneLayer.setOpacity(opacity);
		$('.leg-sw.zone').css('opacity', opacity);
		this.map.render();
	},
	/** 
	 * @private 
	 * @method
	 * @return {string}
	 */
	ordersUrl: function(){
		var date = new Date(),
			mo = date.getMonth() + 1,
			dt = date.getDate(),
			yr = date.getFullYear(),
			hr = date.getHours();
		return 'order.json?' + yr + '-' + mo + '-' + dt + '-' + hr;
		
	},
	/** 
	 * @private 
	 * @method
	 */
	getOrders: function(url){
		$.ajax({
			url: url,
			dataType: 'json',
			success: $.proxy(this.gotOrders, this),
			error: $.proxy(this.error, this)
		});
	},
	/** 
	 * @private 
	 * @method
	 * @param {Array<number>} data
	 */
	gotOrders: function(data){
		var content = this.content, orders = this.zoneOrders;
		if (data.length){
			var zones = data.length > 1 ? 'Zones ' : 'Zone ';
			$('#splash').addClass('active-order');
			$('.orders').html(content.message('splash_yes_order'));
			$.each(data, function(_, zone){
				orders[zone] = true;
			});
			$.each(data, function(i, zone){
				zones += zone;
				zones += (i == data.length - 2) ? ' and ' : ', ';								
			});
			$('.orders').append(content.message('splash_zone_order', {zones: zones.substr(0, zones.length - 2)}));
		}else{
			$('#splash .orders').html(content.message('no_order'));
		}					
	},
	/** 
	 * @private 
	 * @method
	 * @param {Object} event
	 */
	filter: function(event){
		this.centerSource.filter([{
			property: $(event.target).data('prop'),
			values: $(event.target).data('vals').split(',')
		}]);
		this.list(this.location.coordinates);
	},
	/** 
	 * @private 
	 * @method
	 * @param {ol.Coordinate} coordinates
	 */
	zoomCoords: function(coords){
		this.view.animate({zoom: 17, center: coords});
	},
	/** 
	 * @private 
	 * @method
	 */
	zone: function(){
		var content = this.content,
			zones = this.zoneSource, 
			location = this.location, 
			name = location.name.replace(/,/, '<br>'), 
			coords = location.coordinates, 
			accuracy = location.accuracy,
			features = [],
			html;
		if (accuracy == nyc.Geocoder.Accuracy.HIGH){
			features = zones.getFeaturesAtCoordinate(coords);
		}else{
			var extent = ol.extent.buffer(ol.extent.boundingExtent([coords]), accuracy);
			zones.forEachFeatureIntersectingExtent(extent, function(feature){
				features.push(feature);
			});
		}
		if (features.length == 0) {
			html = content.message('location_no_zone', {name: name});
		}else{
			var zone = features[0].getZone();
			if (features.length == 1 && !features[0].isSurfaceWater()) {
				var order = content.message(this.zoneOrders[zone] ? 'yes_order' : 'no_order');
				html = content.message('location_zone_order', {zone: zone, order: order, name: name});
			}else{
				html = content.message('location_zone_unkown', {name: name}); 
			}
		}
		this.showPopup(coords, html);
	},
	/** 
	 * @private 
	 * @method
	 * @param {Object} event
	 */
	mapClick: function(event){
		var me = this, map = me.map, px = event.pixel;
		map.forEachFeatureAtPixel(px, function(feature, layer){
			var coords, html;
			if (layer == me.zoneLayer){
				coords = map.getCoordinateFromPixel(px);
				html = feature.html();
			}else if (layer == me.centerLayer){
				coords = feature.getCoordinates();
				html = feature.html('inf-pop');
			}
			if (coords){
				me.showPopup(coords, html);
				return true;
			}
		});
	},
	/** 
	 * @private 
	 * @method
	 * @param {ol.Coordinate} coordinates
	 * @param {string} html
	 */
	showPopup: function(coordinates, html){
		this.hideTips();
		this.popup.setOffset([0, -10]);
		this.popup.show({
			coordinates: coordinates,
			html: html
		});
	},
	/** 
	 * @private 
	 * @method
	 */
	zoneTip: function(){
		var zone = this.getZone(), 
			evacuate = this.orders[zone],
			order = this.message(evacuate ? 'yes_order' : 'no_order');
		return {
			cssClass: 'tip-zone',
			text: this.message('zone_tip', {zone: zone, order: order})
		};
	},
	/** 
	 * @private 
	 * @method
	 */
	centerTip: function(){
		return {
			cssClass: 'tip-center',
			text:  this.message('center_tip', {css: this.isAccessible() ? 'access' : '', name: this.getName()})
		};
	},
	/** 
	 * @private 
	 * @method
	 */
	locationTip: function(){
		return {
			cssClass: 'tip-location',
			text: this.getName().replace(/,/, '<br>')
		};			
	},
	/** 
	 * @private 
	 * @method
	 */
	hideTips: function(){
		$.each(this.tips, function(_, tip){
			tip.hide();
		});
	},
	/** 
	 * @private 
	 * @method
	 * @method
	 */
	error: function(){
		this.alert(this.content.message('data_load_error'));
	},
	/**
	 * @private 
	 * @param {string} msg
	 */
	alert: function(msg){
		this.dialog = this.dialog || new nyc.Dialog();
		this.dialog.ok(msg);
	}
};
