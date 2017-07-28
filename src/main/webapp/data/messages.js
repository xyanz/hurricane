var MESSAGES = {
	yes_order: '<div class="order active-order">${oem_supplied}</div>',
	no_order: '<div class="order">${oem_supplied}</div>',
	splash_yes_order: '<div class="capitalize">an evacuation order is in effect for</div>',
	splash_zone_order: '<div class="zone">${zones}</div>',
	location_no_zone: '<div class="inf-location"><div class="inf-name">${oem_supplied}</div><div class="inf-name addr">${name}</div></div>',
	location_zone_order: '<div class="inf-location"><div class="inf-name">${oem_supplied}</div>${order}<div class="inf-name addr">${name}</div></div>',
	location_zone_unkown: '<div class="inf-location"><div class="inf-name">${oem_supplied}</div><div class="inf-name addr">${name}</div></div>',
	location_zone_unkown_311: '<div class="inf-location"><div class="inf-name">${oem_supplied}</div><div class="inf-name addr">${name}</div></div>',
	zone_info: '<div class="inf-zone"><div class="inf-name">Zone ${zone}</div>${order}</div>',
	zone_tip: '<div class="capitalize">evacuation zone ${zone}</div><div>${order}</div>',
	center_info_field: '<div class="${css} notranslate" translate="no">${value}</div>',
	center_cross_st_field: '<div class="inf-addr inf-cross">Between <span class="notranslate" translate="no">${cross1}</span> and <span class="notranslate" translate="no">${cross2}</span>',
	center_distance: '<div class="inf-dist">&#8226; ${distance} miles &#8226;</div>',
	center_info_map: '<div class="capitalize inf-btn inf-map"><a data-role="button" onclick=\'nyc.app.zoomFacility("${id}");\'>map</a></div>',
	center_info_dir: '<div class="capitalize inf-btn inf-dir"><a data-role="button" onclick=\'nyc.app.direct("${id}");\'>directions</a></div>',
	center_info_access: '<div class="capitalize inf-btn inf-detail-btn"><a data-role="button" onclick=\'nyc.util.preventDblEventHandler(event, nyc.app.access, nyc.app);\'>details...</a></div><div class="inf-detail">${detail}</div>',
	center_tip: '<div class="${css}">${name}</div>',
	bad_input: 'The location you entered was not understood',
	data_load_error: 'There was a problem loading map data. Please refresh the page to try again.',
	trip_planner: 'For directions with information regarding wheelchair accessible subway stations use the <a href="http://tripplanner.mta.info/MyTrip/ui_phone/cp/idefault.aspx" target="_blank" rel="noopener noreferer">MTA Trip Planner</a>.',
	no_directions: '<span class="capitalize">${travelMode}</span> directions from <b><span class="notranslate" translate="no">${origin}</span></b> to <b><span class="notranslate" translate="no">${destination}</span></b> are not available.  Please try a different mode of transportation.',
	acc_feat: '<ul><li>${ACC_FEAT}</li><li>Access to the main shelter areas will be unobstructed and without steps. </li><li>Accessible restrooms are available.</li><li>Accessible dormitory and eating/cafeteria areas are available.</li><li>Additional amenities will be available such as accessible cots and mobility aids (canes, crutches, manual wheelchairs, storage space for refrigerated medication, etc.).</li></ul>'
};