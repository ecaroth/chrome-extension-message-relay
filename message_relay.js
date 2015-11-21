"use strict";

function message_relay( namespace, relay_level, debug ){

    var _debug = debug || false,

        _levels = {                             //available levels msg relay can be used at
            extension:  'extension',
            content:    'content',
            page:       'page',
            iframe:     'iframe',
            iframe_shim:'iframe_shim'
        },
        _level_order = {                        //ordering of levels (indicitive of how messages can bubble up/down)
            extension: 4,
            content: 3,
            page: 2,
            iframe_shim: 1,
            iframe: 0
        },

        level = relay_level,                    //relay level (one of 'content','page','iframe','extension') - the level that THIS relay is listening at
        received_messages = [],                 //digest of all received messages (in debug mode only)
        valid_windows = [],                     //list of valid windows that can access message relay (parent windows, iframes in pages, etc)
        msg_namespace = namespace,              //the namespace for your msg relay - used to capture and identify relay msgs from other postMsg traffic "docalytics.message";   //
        last_sender_info = null,                //info about the last message sender
        last_msg_type = null,                   //the last received message type
        listeners = {};                         //bound listeners for the relay (at this level)

    //this function allows you to bind any msg type as a listener, and will ping the callback when the message comes to this level (exposed as <instance>.on)
    //you can also namespace msg types with msg_type.namespace, or specify no namespace
    function _bind( msg_types, cb ){
        if(typeof(msg_types)=='string') msg_types = [msg_types];
        for(var i=0; i<msg_types.length; i++){
            var parts = msg_types[i].split('.'),
                _mtype = parts[0],
                _namespace = parts[1];
            if(!(_mtype in listeners)) listeners[_mtype] = [];
            listeners[_mtype].push({ 'fn': cb, 'ns': _namespace});
        }
    };

    //this function allows you to UNbind any msg type as a listener (with a sepcified namespace or ALL events of this type(s) if no namespace is supplied)
    var _unbind = function(msg_types){
        if(typeof(_mtype)=='string') msg_types = [msg_types];
        for(var i=0; i<msg_types.length; i++){
            var parts = msg_types[i].split('.'),
                _mtype = parts[0],
                _namespace = parts[1];
            if(_mtype in listeners){
                if(!_namespace){
                    //unbind ALL listeners on this message type
                    delete listeners[_mtype];
                }else{
                    //find only messages bound on this namespace/type
                    for(var j=msg_types[i].length; j>=0; j--){
                        if(msg_types[i][j].ns == _namespace) msg_types[i].splice(j,1);
                    }
                }
            }
            listeners[_mtype].push({ 'fn': cb, 'ns': _namespace});
        }
    };

    //this function unbinds ALL listeners
    var _unbind_all = function(){
        listeners = {};
    };

    //get the base msg object used for relaying
    var _get_msg = function( type, dest, up, data ){
        //type = string, message type (specified when calling send_up or send_down)
        //dest = detination level (one of _levels) - NOTE: can specific a specific tab.id to use only by specifying a @tab.id
        //up = boolean, is this message going upwards (else going down)
        //data = javascript variable to pass with message
        if(!data) data = {};
        var msg_id = ('msg_id' in data) ? data['msg_id'] : dest+":"+type+":"+(new Date().getTime());
        data['msg_id'] = msg_id;
        var msg_obj = {
            msg_type:           type,
            msg_from:           level,
            msg_destination:    dest,
            msg_up:             up,
            msg_name:           msg_namespace,
            msg_data:           data,
            msg_id:             msg_id,
            msg_tab_id:         null
        }
        var dest_data = _parse_destination(dest),
            _level = dest_data[0],
            _tab_id = dest_data[1];
        if( _tab_id ){
            var parts = dest.split("@");
            msg_obj.msg_destination = _level;
            msg_obj.msg_tab_id = _tab_id;
        }
        return msg_obj;
    };

    //send a message to the specified level(s) - NOTE destinations can be a string or array of destination strings
    function _send_msg( msg_type, destinations, data , cb ){
        if(typeof(destinations)=='string') destinations = [destinations];
        for(var i=0; i<destinations.length; i++) {
            if( !_is_valid_destination(destinations[i]) ){
                _log("NOTICE - invalid level specified as destination ("+destinations[i]+")");
                continue;
            }
            var dest_data = _parse_destination(destinations[i]),
                _dest_level = dest_data[0];
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

    //This function is used by both send_up and send_down to relay a message the proper direction
    function _relay( data, cb ){
        if( (level==_levels.extension) && _levels[data['msg_destination']] < _levels.extension ){
            //broadcasting DOWN from extension to content script - percolate it to each tab using chrome.tabs.sendMessage
            //UNLESS a specific tab id is included on the request destination
            chrome.tabs.query({}, function(tabs){
                for (var i = 0; i < tabs.length; i++) {
                    if(data.msg_tab_id && tabs[i].id != data.msg_tab_id) continue;
                    chrome.tabs.sendMessage(tabs[i].id, data, function(response){
                        if(cb) cb(response);
                    });
                }
            });
        }else if( (level==_levels.content && data['msg_destination']==_levels.extension) || level==_levels.extension ){
            //going form content script to extension.. use chrome runtime sendmessage
            chrome.runtime.sendMessage( data, function(response) {
                if(cb && typeof(cb)=='function') cb(response);
            });
        }else{
            //no interaction with extension background, broadcast w/ postmessage
            if( level == _levels.iframe || level == _levels.iframe_shim ) {
                window.parent.postMessage(data, "*");
            }else if( (level==_levels.page || level==_levels.content) && data['msg_destination']==_levels.iframe){
                //TODO: add support for targetting a specific iframe domain or DOM elem?
                var iframes = document.getElementsByTagName('iframe');
                for(var i=0; i<iframes.length; i++){
                    try{
                        iframes[i].contentWindow.postMessage(data, "*");
                    }catch(e){}
                }
            }else{
                window.postMessage(data, "*");
            }
        }
    }


    //This function is called for every incoming message to this level and determines if the messsage is intended for this level
    //(and calls needed listeners) or continues relaying it upwards/downwards
    function _incoming_message( msg, responder, sender ){
        var msg_data =          msg.msg_data,
            msg_from =          msg.msg_from,
            msg_up =            msg.msg_up,
            msg_destination =   msg.msg_destination,
            msg_type =          msg.msg_type,
            msg_id =            msg.msg_id,
            msg_tab_id =        msg.msg_tab_id;

        if(sender) last_sender_info = sender;
        last_msg_type = msg_type;
        var _msg_reception_id = msg_id+':'+msg_destination;

        if(msg_from==level || received_messages.indexOf(_msg_reception_id) != -1){
            //message already received - need this because page scripts and content scripts listen at same postMessage level and we don't want to relay it twice if it's a pass-through
            return;
        }

        if( msg_destination == level ){
            //message intended for this level, call any bound listeners
            _log( "Msg ("+msg_type+") received from "+msg_from+" to "+msg_destination+' - '+ JSON.stringify(msg_data) );
            received_messages.push(_msg_reception_id);
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
    function _call_bound_listeners( msg_type, msg_data, sender, responder ){
        if(!(msg_type in listeners)) return;
        for(var i=0; i < listeners[msg_type].length; i++ ){
            if(typeof(responder)=='function'){
                //includes responder function (extension only)
                listeners[msg_type][i].fn( msg_data, responder );
            }else{
                if(listeners[msg_type][i].fn.length==2){
                    listeners[msg_type][i].fn( msg_data, sender );
                }else{
                    listeners[msg_type][i].fn( msg_data );
                }
            }
        }
    }

    //check if a level is an actual context level (or level w/ tab.id)
    function _is_valid_destination(dest){
        if(!dest) return false;
        var dest_data = _parse_destination(dest),
            _level = dest_data[0],
            _tab_id = dest_data[1];
        return (_level in _levels);
    }

    //function to parse a destination address and return level (and optionally set tab.id)
    function _parse_destination(dest){
        return dest.split("@");
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

    if( [_levels.page,_levels.content,_levels.iframe,_levels.iframe_shim].indexOf(level) != -1  ){
        //this relay is in the page, content, or iframe level so setup listener for postmessage calls
        window.addEventListener('message', function(event){
            var evt_data = event.data;
            if(typeof(evt_data)=='object' && 'msg_name' in evt_data && (evt_data.msg_name == msg_namespace)){
                _incoming_message( evt_data );
            }
        });
    }
    if( [_levels.content,_levels.extension].indexOf(level) != -1 ){
        //this relay is in the content or extension level, so setup listensers for chrome ext message passing
        try{
            chrome.runtime.onMessage.addListener(
                function(msg, sender, sendResponse) {
                    _incoming_message( msg, sendResponse, sender );
                }
            );
        }catch(e){}
    }

    return {
        levels: _levels,
        on: _bind,
        off: _unbind,
        offAll: _unbind_all,
        send: _send_msg,
        levelViaTabId: _level_via_tab_id,
        getLastMsgSenderInfo: function(){ return last_sender_info; },
        getLastMsgType: function(){ return last_msg_type; }
    };
}