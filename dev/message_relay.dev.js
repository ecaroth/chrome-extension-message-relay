"use strict";

// IMPORTANT NOTE!
// DO NOT use this version of the script in production, this is the dev/build version that exposes internal 
// functions for testing. Use the modified, minified version in /dist/message_relay.prod.js

// NOTE - lines that include /*REM*/ are stripped when building production version of this script

(function(){

    var relay = function( namespace, relay_level, debug ){

        var _debug = debug || false,

            _levels = {                             //available levels msg relay can be used at
                extension:  'extension',            //relay running in chrome extension
                content:    'content',              //relay running in content script
                page:       'page',                 //relay running on web page
                iframe:     'iframe',               //relay running in iframe
                iframe_shim:'iframe_shim',          //relay running in an iframe shim (see readme)
                test:       'test'                  //relay for unit testing
            },
            _level_order = {                        //ordering of levels (indicitive of how messages can bubble up/down)
                extension:      4,
                content:        3,
                page:           2,
                iframe_shim:    1,
                iframe:         0,
                test:           -1
            },

            level = relay_level,                        //relay level (one of 'content','page','iframe','extension') - the level that THIS relay is listening at
            received_messages = {},                     //digest of all received messages by msg_id, which is cleaned out every 2 mins to keep memory usage down
            received_msg_clean_tmo = null,              //tmo for setTimeout call used to clean received_messages digest every 2 minutes
            received_msg_clean_interval_secs = 2*60,    //2 mins between digest cleaning intervals
            msg_namespace = namespace,                  //the namespace for your msg relay - used to capture and identify relay msgs from other postMsg traffic "docalytics.message";   //
            last_sender_info = null,                    //info about the last message sender
            last_msg_type = null,                       //the last received message type
            listeners = {};                             //bound listeners for the relay (at this level)

        
        // =============== START OF TEST-ONLY VARIABLE DEFS ====================

        var test_relay_fn = null;  //relay function to send events to when level=test (set in returned test.setRelayFn)     /*REM*/ 
            
        // =============== END OF TEST-ONLY VARIABLE DEFS ====================

        //this function allows you to bind any msg type as a listener, and will ping the callback when the message comes to this level (exposed as <instance>.on)
        //you can also namespace msg types with msg_type.namespace, or specify no namespace
        function _bind( msg_types, cb ){
            if( typeof msg_types === 'string' ) msg_types = [msg_types];
            for(var i=0; i<msg_types.length; i++){
                var mtype_info = _get_mtype_info(msg_types[i]);

                if(!(mtype_info.type in listeners)) listeners[mtype_info.type] = [];
                listeners[mtype_info.type].push({ 'fn': cb, 'ns': mtype_info.namespace});
            }
        }

        //this function allows you to unbind any msg type as a listener (with a sepcified namespace or ALL events of this type(s) if no namespace is supplied)
        function _unbind(msg_types){
            if( typeof msg_types === 'string' ) msg_types = [msg_types];
            for(var i=0; i<msg_types.length; i++){
                var mtype_info = _get_mtype_info(msg_types[i]);

                if(mtype_info.type in listeners){
                    if(!mtype_info.namespace){
                        //unbind ALL listeners on this message type
                        delete listeners[mtype_info.type];
                    }else{
                        //find only messages bound on this namespace/type
                        _unbind_namspace_listeners_for_message_type( mtype_info.type, mtype_info.namespace );
                    }
                }
            }
        }

        //this function parses message type into component parts (type && namespace)
        function _get_mtype_info(msg_type){
            var parts = msg_type.split(".");
            return {
                type: parts.splice(0,1)[0],
                namespace: parts.length > 0 ? parts.join(".") : null
            };
        }


        //utility function to unbind all namespaced listeners for supplied message type
        function _unbind_namspace_listeners_for_message_type( msg_type, namespace ){
            if(!(msg_type in listeners)) return;
            for( var i = listeners[msg_type].length-1; i>=0; i--){
                if(listeners[msg_type][i].ns === namespace) listeners[msg_type].splice(i,1);
            }
        }

        //this function unbinds ALL listeners, or all listeners for a specific namespace
        function _unbind_all( namespace ){
            if( !namespace){
                listeners = {};
            }else{
                for(var msg_type in listeners){
                    _unbind_namspace_listeners_for_message_type(msg_type, namespace);
                }
            }
        }

        //get the base msg object used for relaying
        function _get_msg( type, dest, up, data ){
            //type = string, message type (specified when calling send_up or send_down)
            //dest = detination level (one of _levels) - NOTE: can specific a specific tab.id to use only by specifying a @tab.id
            //up = boolean, is this message going upwards (else going down)
            //data = javascript variable to pass with message
            if(!data) data = {};
            var msg_id = ('msg_id' in data) ? data.msg_id : dest +":"+type+":"+(new Date().getTime());
            data.msg_id = msg_id;
            var msg_obj = {
                msg_type:           type,
                msg_from:           level,
                msg_destination:    dest,
                msg_up:             up,
                msg_namespace:      msg_namespace,
                msg_data:           data,
                msg_id:             msg_id,
                msg_tab_id:         null
            };
            var _dest = _parse_destination(dest);
            if( _dest.tab_id ){
                msg_obj.msg_destination = _dest.level;
                msg_obj.msg_tab_id = _dest.tab_id;
            }
            return msg_obj;
        }

        //send a message to the specified level(s) - NOTE destinations can be a string or array of destination strings
        function _send_msg( msg_type, destinations, data , cb ){
            if( typeof destinations === 'string' ) destinations = [destinations];
            for(var i=0; i<destinations.length; i++) {
                if( !_is_valid_destination(destinations[i]) ){
                    _log("NOTICE - invalid level specified as destination ("+destinations[i]+")");
                    continue;
                }
                var _dest_level = _parse_destination(destinations[i]).level;
                if (_level_order[_dest_level] < _level_order[level]) {
                    _send_down(msg_type, destinations[i], data, cb);
                } else {
                    _send_up(msg_type, destinations[i], data, cb);
                }
            }
        }

        //send a message DOWN the listening stack (exposed as <instance>.send_down)
        function _send_down( msg_type, destination, data, cb ){
            var msg = _get_msg( msg_type, destination, false, data );
            _log( "Send msg DOWN from "+level+" to "+destination+" : "+msg_type+" - "+JSON.stringify(data));
            _relay( msg, cb );
        }

        //send a message UP the listening stack (exposed as <instance>.send_up)
        function _send_up( msg_type, destination, data, cb ){
            var msg = _get_msg( msg_type, destination, true, data );
            _log( "Send msg UP from "+level+" to "+destination+" : "+msg_type+" - "+ JSON.stringify(data));
            _relay( msg, cb );
        }

        //fn to relay a message from this_level either up/down (using appropriate method baesd on data.msg_destination)
        function _relay_from_to_level( this_level, data, cb ){
            if( this_level === _levels.extension && _level_order[data.msg_destination] < _level_order.extension ){
                //broadcasting DOWN from extension to content script - percolate it to each tab using chrome.tabs.sendMessage
                //UNLESS a specific tab id is included on the request destination
                
                if(level === _levels.test){                                                             /*REM*/
                    if(typeof test_relay_fn === 'function') test_relay_fn("extension_down", data, cb);  /*REM*/
                }else{                                                                                  /*REM*/
                    chrome.tabs.query({}, function(tabs){
                        for (var i = 0; i < tabs.length; i++) {
                            if(data.msg_tab_id && tabs[i].id !== data.msg_tab_id) continue;
                            chrome.tabs.sendMessage(tabs[i].id, data, function(response){
                                if(cb) cb(response);
                            });
                        }
                    });
                }                                                                                       /*REM*/
            }else if( (this_level === _levels.content && data.msg_destination === _levels.extension) || this_level === _levels.extension ){
                //going UP form content script to extension.. use chrome runtime sendmessage
                        
                if(level === _levels.test){                                                             /*REM*/
                    if(typeof test_relay_fn === 'function') test_relay_fn("content_up", data, cb);      /*REM*/
                }else{                                                                                  /*REM*/
                    chrome.runtime.sendMessage( data, function(response) {
                        if(cb && typeof cb === 'function') cb(response);
                    }); 
                }                                                                                       /*REM*/
            }else{
                //no interaction with extension background, broadcast UP w/ postmessage so content/page can receive
                if( this_level === _levels.iframe || this_level === _levels.iframe_shim ) { 
                    if(level === _levels.test){                                                         /*REM*/
                        if(typeof test_relay_fn === 'function') test_relay_fn("iframe_up", data, cb);   /*REM*/
                    }else{                                                                              /*REM*/
                        window.parent.postMessage(data, "*");
                    }                                                                                   /*REM*/
                }else if( (this_level === _levels.page || this_level === _levels.content) && data.msg_destination === _levels.iframe){
                    //going DOWN from page or content to iframe, so postMessage to iframe(s) directly
                    //TODO: add support for targetting a specific iframe domain or DOM elem?
                    
                    if(level === _levels.test){                                                         /*REM*/
                        if(typeof test_relay_fn === 'function') test_relay_fn("iframe_down", data, cb); /*REM*/
                    }else{                                                                              /*REM*/
                        var iframes = document.getElementsByTagName('iframe');
                        for(var i=0; i<iframes.length; i++){
                            try{
                                iframes[i].contentWindow.postMessage(data, "*");
                            }catch(e){}
                        }
                    }                                                                                   /*REM*/
                }else{
                    //communication between content and page directly (UP or DOWN) or from content to iframe_shim
                    if(level === _levels.test){                                                         /*REM*/
                        if(typeof test_relay_fn === 'function'){                                        /*REM*/
                            test_relay_fn("page_content_"+(data.msg_up ? 'up' : 'down'), data, cb);     /*REM*/
                        }                                                                               /*REM*/
                    }else{                                                                              /*REM*/
                        window.postMessage(data, "*");
                    }                                                                                   /*REM*/
                }
            }
        }

        //This function is used by both send_up and send_down to relay a message the proper direction
        function _relay( data, cb ){
            _relay_from_to_level( level, data, cb );
        }


        //This function is called for every incoming message to this level and determines if the messsage is intended for this level
        //(and calls needed listeners) or continues relaying it upwards/downwards
        function _incoming_message( msg, responder, sender ){
            //searialize/unserialize msg object so we don't end up with closure memory leaks
            msg = JSON.parse( JSON.stringify(msg) );

            var msg_data =          msg.msg_data,
                msg_from =          msg.msg_from,
                msg_up =            msg.msg_up,
                msg_destination =   msg.msg_destination,
                msg_type =          msg.msg_type,
                msg_id =            msg.msg_id;

            if(sender) last_sender_info = sender;
            last_msg_type = msg_type;
            var _msg_reception_id = msg_id+':'+msg_destination;

            if(msg_from === level || (_msg_reception_id in received_messages)){
                //message already received - need this because page scripts and content scripts listen at same 
                //postMessage level and we don't want to relay it twice if it's a pass-through
                return false;
            }

            if( msg_destination === level ){
                //message intended for this level, call any bound listeners
                _log( "Msg ("+msg_type+") received from "+msg_from+" to "+msg_destination+' - '+ JSON.stringify(msg_data) );
                received_messages[_msg_reception_id] = 0;
                _call_bound_listeners( msg_type, msg_data, sender, responder );
            }else{
                //message still bubbling up/down.. just relay if needed
                msg.msg_from = level;
                if(msg_up && _level_order[level] > _level_order[msg_from]){
                    _relay( msg );
                    _log( "Msg ("+msg_type+") relaying UP from "+msg_from+" to "+msg_destination+' - '+ JSON.stringify(msg_data) );
                }else if(!msg_up && _level_order[level] < _level_order[msg_from]){
                    _relay( msg );
                    _log( "Msg ("+msg_type+") relaying DOWN "+msg_from+" to "+msg_destination+' - '+ JSON.stringify(msg_data) );
                }
            }
        }

        //call all bound listeners for this message type at this level
        function _call_bound_listeners( msg_type, msg_data, responder ){
            if(!(msg_type in listeners)) return;
            for(var i=0; i < listeners[msg_type].length; i++ ){
                if(typeof responder === 'function'){
                    //includes responder function (extension only)
                    listeners[msg_type][i].fn.call(listeners[msg_type][i],  msg_data, responder );
                }else{
                    listeners[msg_type][i].fn.call( listeners[msg_type][i], msg_data );
                }
            }
        }

        //check if a level is an actual context level (or level w/ tab.id)
        function _is_valid_destination(dest){
            if(!dest) return false;
            var _level = _parse_destination(dest).level;
            return (_level in _levels);
        }

        //function to parse a destination address and return level (and optionally set tab.id)
        function _parse_destination(dest){
            var parts = dest.split("@");
            return {
                level:      parts[0],
                tab_id:     parts[1] || null
            };
        }

        //function to direct a message through channels via specific tab.id
        function _level_via_tab_id( _level, _tab_id ){
            return _level+"@"+_tab_id;
        }

        //log function (that fires only if debug is enabled)
        function _log( msg ){
            if(!_debug) return;
            console.log("::MSG-RELAY ("+level+"):: "+msg);
        }

        //fn to mock an incoming message to the relay (as if incoming from a different level) - useful for testing 
        //funcitonality tied to bound listeners in applications that use the relay
        function _mock_send_msg( msg_type, data ){
            var _msg = _get_msg( msg_type, level, true, data );
            _msg.msg_from = 'mock';
            _incoming_message( _msg, null, {tabId:999} );
        }


        //setup received_messages clear interval, where we clean 2 intervals ago IDs up and mark this batches
        //for deletion in the next interval
        function _setup_received_msg_clean_interval(){
            received_msg_clean_tmo = setInterval(function(){
                var DELETE = 1,
                    MARK_FOR_NEXT_ROUND_DELETE = 0;
                for(var _msg_id in received_messages){
                    if(received_messages[_msg_id] === MARK_FOR_NEXT_ROUND_DELETE){
                        received_messages[_msg_id] = DELETE;
                    }else{
                        delete received_messages[_msg_id];
                    }
                }    
            }, (received_msg_clean_interval_secs * 1000) );
        }
        _setup_received_msg_clean_interval();





        // =============== START OF TEST-ONLY FUNCTIONALITY ====================

        
        //fn to check current env and throw error if we are NOT in test env
        function _is_test(){                                                                                            /*REM*/
            if(level !== _levels.test){                                                                                 /*REM*/
                throw new ChromeExtensionMessageRelayError("Cannot call test methods @ this level!");                   /*REM*/
            }                                                                                                           /*REM*/
            return true;                                                                                                /*REM*/
        }                                                                                                               /*REM*/

        //fn to pass in an internal token, check that we are in a test ENV, and return reference to token
        function _test( token ){                                                                                        /*REM*/
            _is_test();                                                                                                 /*REM*/
            return token;                                                                                               /*REM*/
        }                                                                                                               /*REM*/

        var test_functions = {                                                                                          /*REM*/
            getListeners:   function(){ return _test(listeners); }, //get internal listeners obj                        /*REM*/
            setListeners:   function(v){ _is_test(); listeners=v; }, //set internal listeners obj                       /*REM*/
            clearTMO:       function(){ clearInterval(received_msg_clean_tmo); }, //clear currently running tmo         /*REM*/
            setTMOsecs:     function(v){ received_msg_clean_interval_secs = v; }, //set the tmo interval seconds        /*REM*/
            setRecMsg:      function(v){ received_messages = v; }, //set the received_messages msg_obj                  /*REM*/
            setRelayFn:     function(fn){ _is_test(); test_relay_fn=fn; }, //set relay fn that is called for _relay     /*REM*/
            token:          function(token){                                                                            /*REM*/
                                _is_test();                                                                             /*REM*/
                                return eval(token);                                                                     /*REM*/ // jshint ignore:line
            } //get exposed reference to an internal fn/var                                                             /*REM*/
        };                                                                                                              /*REM*/


        //create custom error class
        function ChromeExtensionMessageRelayError(message) {                                            /*REM*/
            this.name = 'ChromeExtensionMessageRelayError';                                             /*REM*/
            this.message = message || 'Error in chrome extension message relay';                        /*REM*/
            this.stack = (new Error()).stack;                                                           /*REM*/
        }                                                                                               /*REM*/
        ChromeExtensionMessageRelayError.prototype = Object.create(Error.prototype);                    /*REM*/
        ChromeExtensionMessageRelayError.prototype.constructor = ChromeExtensionMessageRelayError;      /*REM*/

        if(level !== _levels.test){                                                                         /*REM*/
            var msg = "ERROR - you are using a version of the script intended only for dev and testing! ";  /*REM*/
            msg += "Please use the version in /dist/message_relay.prod.js";                                 /*REM*/
            throw new ChromeExtensionMessageRelayError(msg);                                                /*REM*/
        }                                                                                                   /*REM*/
            

        // =============== END OF TEST-ONLY FUNCTIONALITY ====================


        if( level !== _levels.test ){
            //if NOT in test ENV, bind needed listeners for appropriate ENV to wire things up
        
            if( [_levels.page,_levels.content,_levels.iframe,_levels.iframe_shim].indexOf(level) !== -1  ){
                //this relay is in the page, content, or iframe level so setup listener for postmessage calls
                window.addEventListener('message', function(event){
                    if(typeof event.data === 'object' && 'msg_namespace' in event.data && (event.data.msg_namespace === msg_namespace)){
                        _incoming_message( event.data );
                    }
                });
            }
            if( [_levels.content,_levels.extension].indexOf(level) !== -1 ){
                //this relay is in the content or extension level, so setup listensers for chrome ext message passing
                try{
                    chrome.runtime.onMessage.addListener(
                        function(msg, sender, sendResponse) {
                            _incoming_message( msg, sendResponse, sender );
                        }
                    );
                }catch(e){}
            }
        }


        return {
            levels: _levels,            //get list of available levels
            on: _bind,                  //bind listener for msg event
            off: _unbind,               //unbind listener for msg event
            offAll: _unbind_all,        //unbind all listeners at this level
            send: _send_msg,            //send message to specific level(s)
            levelViaTabId: _level_via_tab_id,   //send message to specific level (on tabId channel only)
            getLastMsgSenderInfo: function(){   //get the sender info for last received message
                return last_sender_info; 
            },
            getLastMsgType: function(){         //get the msg type for last received message
                return last_msg_type; 
            },
            mockSend: _mock_send_msg    //mock an incoming message to this level, useful for testing apps that use script
            , test: test_functions      //functionality exposed only for testing purposes    /*REM*/
        };
    };

        if (('undefined' !== typeof module) && module.exports) {
           //publish for node
           module.exports = relay;
        }else{
            //publish for browser/extension
            window.chrome_extension_message_relay = relay;
        }

})();