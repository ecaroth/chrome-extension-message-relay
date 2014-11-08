/*
Simple message relay class to facilitate easy cross-context communication for Google Chrome Extensions
Authored by Evan Carothers @ Docalytics
https://github.com/Docalytics/chrome-extension-message-relay
*/

function message_relay( namespace, relay_level, debug ){

    var _debug = debug || false;

    var _levels = {                 //available levels msg relay can be used at
        extension:  'extension',
        content:    'content',
        page:       'page',
        iframe:     'iframe'
    };
    var _level_order = {            //ordering of levels (indicitive of how messages can bubble up/down)
        extension: 4,
        content: 3,
        page: 2,
        iframe: 1
    };

    var level = relay_level;                    //relay level (one of 'content','page','iframe','extension') - the level that THIS relay is listening at
    var received_messages = [];                 //digest of all received messages (in debug mode only)
    var valid_windows = [];                     //list of valid windows that can access message relay (parent windows, iframes in pages, etc)
    var msg_namespace = namespace;              //the namespace for your msg relay - used to capture and identify relay msgs from other postMsg traffic "docalytics.message";   //
    var listeners = {};                         //bound listeners for the relay (at this level)

    //this function allows you to bind any msg type as a listener, and will ping the callback when the message comes to this level (exposed as <instance>.on)
    var _bind = function( msg_types, cb ){
        if(typeof(msg_types)=='string') msg_types = [msg_types];
        for(var i=0; i<msg_types.length; i++){
            if(!(msg_types[i] in listeners)) listeners[msg_types[i]] = [];
            listeners[msg_types[i]].push( cb );
        }
    };

    //get the base msg object used for relaying
    var _get_msg = function( type, dest, up, data ){
        //type = string, message type (specified when calling send_up or send_down)
        //dest = detination level (one of _levels)
        //up = boolean, is this message going upwards (else going down)
        //data = javascript variable to pass with message
        return {
            msg_type:           type,
            msg_from:           level,
            msg_destination:    dest,
            msg_up:             up,
            msg_name:           msg_namespace,
            msg_data:           data,
            msg_id:             dest+":"+type+":"+(new Date().getTime())
        }
    };

    //send a message to the specified level
    var _send_msg = function( msg_type, destination, data , cb ){
        if( _level_order[destination] < _level_order[level] ){
            _send_down( msg_type, destination, data, cb );
        }else{
            _send_up( msg_type, destination, data, cb );
        }
    };

    //send a message DOWN the listening stack (exposed as <instance>.send_down)
    var _send_down = function( msg_type, destination, data, cb ){
        var msg = _get_msg( msg_type, destination, false, data );
        _log(true, "Send msg DOWN from "+level+" to "+destination+" : "+msg_type+" - "+JSON.stringify(data));
        _relay( msg, cb );
    };

    //send a message UP the listening stack (exposed as <instance>.send_up)
    var _send_up = function( msg_type, destination, data, cb ){
        var msg = _get_msg( msg_type, destination, true, data );
        _log(true, "Send msg UP from "+level+" to "+destination+" : "+msg_type+" - "+ JSON.stringify(data));
        _relay( msg, cb );
    };

    //This function is used by both send_up and send_down to relay a message the proper direction
    var _relay = function( data, cb ){
        if( (level==_levels.extension) && _levels[data['msg_destination']] < _levels.extension ){
            //broadcasting DOWN from extension to content script - percolate it to each tab using chrome.tabs.sendMessage
            chrome.tabs.getAllInWindow(null, function(tabs){
                for (var i = 0; i < tabs.length; i++) {
                    chrome.tabs.sendMessage(tabs[i].id, data, function(response){
                        if(cb) cb(response);
                    });
                }
            });
        }else if( (level==_levels.content && data['msg_destination']==_levels.extension) || level==_levels.extension ){
            //going form content script to extension.. use chrome runtime sendmessage
            chrome.runtime.sendMessage( data, function(response) {
                if(cb) cb(response);
            });
        }else{
            //no interaction with extension background, broadcast w/ postmessage
            window.postMessage(data, "*");
        }
    };


    //This function is called for every incoming message to this level and determines if the messsage is intended for this level
    //(and calls needed listeners) or continues relaying it upwards/downwards
    _incoming_message = function( msg, responder ){
        var msg_data =          msg.msg_data,
            msg_from =          msg.msg_from,
            msg_up =            msg.msg_up,
            msg_destination =   msg.msg_destination,
            msg_type =          msg.msg_type,
            msg_id =            msg.msg_id;
        if(msg_from==level || received_messages.indexOf(msg_id) != -1){
            //message already received - need this because page scripts and content scripts listen at same postMessage level and we don't want to relay it twice if it's a pass-through
            return;
        }
        _log( "Msg ("+msg_type+") received from "+msg_from+" to "+msg_destination+' - '+ JSON.stringify(msg_data) );

        if( msg_destination == level ){
            //message intended for this level, call any bound listeners
            received_messages.push(msg_id);
            _call_bound_listeners( msg_type, msg_data, responder );
        }else{
            //message still bubbling up/down.. just relay if needed
            msg.msg_from = level;
            if(msg_up && (_level_order[level]-1)==_level_order[msg_from]) {
                _relay( msg );
            }else if( (_level_order[level]+1)==_level_order[msg_from]){
                _relay( msg );
            }
        }
    };

    //call all bound listeners for this message type at this level
    var _call_bound_listeners = function( msg_type, msg_data, responder ){
        if(!(msg_type in listeners)) return;
        for(var i=0; i < listeners[msg_type].length; i++ ){
            if(typeof(responder)=='function'){
                //includes responder function (extension only)
                listeners[msg_type][i]( msg_data, responder );
            }else{
                listeners[msg_type][i]( msg_data );
            }
        }
    };

    var _log = function( msg ){
        if(!debug) return;
        console.log("::MSG-RELAY ("+level+"):: "+msg);
    }

    if( [_levels.page,_levels.content,_levels.iframe].indexOf(level) != -1  ){
        //this relay is in the page, content, or iframe level so setup listener for postmessage calls
        window.addEventListener('message', function(event){
            var evt_data = event.data;
            try{
                if(typeof(evt_data) != 'object') evt_data = JSON.parse(evt_data);
            }catch(err){}
            if(typeof(evt_data)=='object' && 'msg_name' in evt_data && (evt_data.msg_name == msg_namespace)){
                _incoming_message( evt_data, null );
            }
        });
    }
    if( [_levels.content,_levels.extension].indexOf(level) != -1 ){
        //this relay is in the content or extension level, so setup listensers for chrome ext message passing
        try{
            chrome.runtime.onMessage.addListener(
                function(msg, sender, sendResponse) {
                    _incoming_message( msg, sendResponse );
                }
            );
        }catch(e){}
    }

    return {
        levels: _levels,
        on: _bind,
        send: _send_msg
    };
};