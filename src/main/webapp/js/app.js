/** @public */
window.nyc = window.nyc || {};

/**
 * @desc A class to manage user interaction with the hurricane map
 * @public
 * @class
 * @constructor
 * @param {ol.Map} map The OpenLayers map for the hurricane map
 * @param {Object<string, Object>} featureDecorations Decorations for the evacuation zone and evacuation center features
 * @param {nyc.HurricaneContent} content Manages content messages
 * @param {nyc.Style} style Styles layers
 * @param {nyc.LocationMgr} locationMgr Locates using geolocation and geocoding
 * @param {nyc.Directions} directions Generates directions using Google Maps
 * @param {nyc.ol.Popup} popup Popup for displaying feature information on map click
 */
nyc.App = function(map, featureDecorations, content, style, locationMgr, directions, popup){
	var me = this;
	nyc.app = me;
	me.map = map;
	me.geocoder = locationMgr.locate.geocoder,
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
	
	me.setState();
	
	me.zoneSource = new nyc.ol.source.Decorating(
		{url: 'data/zone.json' , format: new ol.format.TopoJSON},
		[content, {orders: me.zoneOrders}, featureDecorations.zone.fieldAccessors, featureDecorations.zone.htmlRenderer]
	);
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
		{loader: new nyc.ol.source.CsvPointFeatureLoader({
			url: 'data/center.csv?' + nyc.cacheBust,
			projection: 'EPSG:2263',
			fidCol: 'BLDG_ID',
			xCol: 'X',
			yCol: 'Y'
		})}, 
		[content, featureDecorations.center.fieldAccessors, featureDecorations.center.htmlRenderer],
		{nativeProjection: 'EPSG:2263', projection: 'EPSG:3857'}
	);
	
	me.centerSource.on(nyc.ol.source.Decorating.LoaderEventType.FEATURELOADERROR, $.proxy(me.error, me));
	me.centerSource.on(nyc.ol.source.Decorating.LoaderEventType.FEATURESLOADED, function(){
		me.centerLayer = new ol.layer.Vector({
			source: me.centerSource,
			style: $.proxy(style.centerStyle, style)
		});
		map.addLayer(me.centerLayer);
		me.tips.push(
			new nyc.ol.FeatureTip(map, [{layer: me.centerLayer, labelFunction: me.centerTip}])
		);
	});
	
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
	 * @member {nyc.Geocoder}
	 */
	geocoder: null,
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
	/** 
	 * @private  
	 * @member {nyc.HurricaneContent}
	 */
	content: null,
	/** 
	 * @private
	 * @member {nyc.content}
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
	 * @member {Object<string, boolean>}
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
		if (nyc.util.isIos()){
			setTimeout($.proxy(this.doLayout, this), 500);
		}else{
			this.doLayout();
		}
	},
	/** 
	 * @private
	 * @method
	 */
	doLayout: function(){
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
		$('#tabs li a').removeClass('ui-btn-active');
		if (mobile){
			$('#tabs').removeClass('only-two');
			$('#tabs').tabs('refresh').tabs({active: 0});
			$('#map-tab-btn a').addClass('ui-btn-active');
		}else{
			$('#tabs').addClass('only-two');
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
			from = me.origin();
		
		$('body').pagecontainer('change', $('#dir-page'), {transition: 'slideup'});
		if (me.lastDir != from + '|' + to){
			var args = {from: unescape(from), to: unescape(to), facility: unescape(name)};
			me.lastDir = from + '|' + to;
			me.directions.directions(args);
		}
		
		if ($('#inf-full-screen').is(':visible')){
			$('#inf-full-screen').hide();
		}
	},
	/** 
	 * @desc Toggle the display of accessibility info
	 * @public 
	 * @method
	 * @param {JQueryEvent} event The click event of toggle button
	 */
	access: function(event){
		var me = this, parent = $(event.target).parent(), detail = parent.next();
		detail.slideToggle(function(){
			if (parent.parent().hasClass('inf-pop')) {
				if ($('.popup').height() > $('#map').height()){
					me.fullScreenDetail();
					detail.hide();
				}else{
					me.popup.pan();
				}
			}				
		});
	},
	/** 
	 * @private 
	 * @method
	 * @return {string}
	 */
	fullScreenDetail: function(){
		$('#inf-full-screen div').html($('.popup-content').html());
		$('#inf-full-screen').fadeIn();
	},
	/** 
	 * @private 
	 * @method
	 * @return {string}
	 */
	origin: function(){
		var location = this.location || {};
		if (location.type == 'geolocation'){
			var coordinates = proj4('EPSG:3857', 'EPSG:4326', location.coordinates);
			return [coordinates[1], coordinates[0]];
		}
		return location.name || '';
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
			$('#centers-tab').height() - $('#centers-tab .centers-top').height() - 5
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
	 */
	setState: function(){
		var content = this.content;
		$('#splash-cont .orders').html('<div class="order">' + content.message('splash_msg') + '</div>');
		this.getOrders();
		if (content.message('post_storm') == 'NO'){
			$('#centers-tab-btn a').addClass('pre-storm');
		}
		var banner = content.message('banner_text'), title = 'NYC ' + banner;
		document.title = title;
		$('.banner h1').html(banner).attr('title', title);		
		$('.banner img').attr('alt', title);		
		$('#btn-view-map').html(content.message('btn_text'));		
		$('#centers-tab-btn a').html(content.message('centers_tab'));		
		$('.filter-center').html(content.message('filter_centers'));		
		$('.leg-center').html(content.message('legend_center'));		
		$('#centers-tab .panel-note').html(content.message('centers_msg'));		
		$('#legend-tab .panel-note.top').html(content.message('legend_msg'));			
		$('#first-load').fadeOut();
	},
	/** 
	 * @private 
	 * @method
	 */
	getOrderUrl: function(){
		return 'data/order.csv?' + nyc.cacheBust;
	},
	/** 
	 * @private 
	 * @method
	 */
	getOrders: function(){
		$.ajax({
			url: this.getOrderUrl(),
			dataType: 'text',
			success: $.proxy(this.gotOrders, this),
			error: $.proxy(this.error, this)
		});
	},
	/** 
	 * @private 
	 * @method
	 * @param {string} csv
	 */
	gotOrders: function(csv){
		var content = this.content, orders = this.zoneOrders, data = $.csv.toObjects(csv), evacReq = [], zones = 'Zone ';
		this.ordersLoaded = true;
		$.each(data, function(_, zone){
			if (zone.EVACUATE == 'YES'){
				orders[zone.ZONE] = true;
				evacReq.push(zone.ZONE);
			}				
		});
		content.zoneOrders = orders;
		if (evacReq.length && content.messages.post_storm == 'NO'){
			$('body').addClass('pre-storm').addClass('has-order');
			$('#splash').addClass('active-order');
			$('.orders').html(content.message('splash_yes_order'));
			if (evacReq.length > 1){
				zones = 'Zones ';
			}
			$.each(evacReq, function(i, zone){
				zones += zone;
				zones += (i == evacReq.length - 2) ? ' and ' : ', ';								
			});
			$('.orders').append(content.message('splash_zone_order', {zones: zones.substr(0, zones.length - 2)}));
		}else if (content.messages.post_storm == 'YES'){
			$('body').addClass('post-storm');
		}

	},
	/** 
	 * @private 
	 * @method
	 * @param {JQueryEvent} event
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
		var html = this.content.locationMsg(this.location) || this.queryZone();
		this.showPopup(this.location.coordinates, html);
	},	
	/** 
	 * @private 
	 * @method
	 */
	queryZone: function(){
		var content = this.content,
			zones = this.zoneSource, 
			location = this.location, 
			name = location.name.replace(/,/, '<br>'), 
			coords = location.coordinates, 
			accuracy = location.accuracy,
			buffer = this.geocoder.accuracyDistance(accuracy),
			features = [],
			html;
		if (accuracy == nyc.Geocoder.Accuracy.HIGH){
			features = zones.getFeaturesAtCoordinate(coords);
		}else{
			var extent = ol.extent.buffer(ol.extent.boundingExtent([coords]), buffer);
			zones.forEachFeatureIntersectingExtent(extent, function(feature){
				features.push(feature);
			});
		}
		if (features.length == 0) {
			html = content.message('location_no_zone', {
				name: name, 
				oem_supplied: content.message('user_in_x_zone')
			});
		}else{
			zone = features[0].isSurfaceWater() ? '1' : features[0].getZone();
			if (features.length == 1) {
				html = content.message('location_zone_order', { 
					order: content.zoneMsg(zone), 
					name: name, 
					oem_supplied: content.message('user_zone', {zone: zone})
				});	
			}else{
				html = content.message('location_zone_unkown', {
					name: name, 
					oem_supplied: content.message('user_zone_unkown')
				}); 
			}
		}
		return html;
	},
	/** 
	 * @private 
	 * @method
	 * @param {ol.MapBrowserEvent} event
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
		if (!this.isSurfaceWater()){
			var zone = this.getZone();
			return {
				cssClass: 'tip-zone',
				text: this.message('zone_tip', {zone: zone, order: this.zoneMsg(zone)})
			};
		}
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
		this.dialog.ok({message: msg});
	}
};
