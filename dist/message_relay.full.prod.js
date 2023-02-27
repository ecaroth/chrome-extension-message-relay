/* Version 3.0.9 chrome-extension-message-relay (https://github.com/ecaroth/chrome-extension-message-relay), Authored by Evan Carothers */

// IMPORTANT NOTE!
// DO NOT use this version of the script in production, this is the dev/build version that exposes internal
// functions for testing. Use the modified, minified version in /dist/message_relay.prod.js



/* MODULE_EXPORTS */ ((globals) => {

    const relay = function( namespace, relayLevel, debug, targetDomain ){
        if(!targetDomain) targetDomain = "*";

        const _debug = debug || false,

            LEVELS = Object.freeze({             // available levels msg relay can be used at
                service_worker:  'service_worker',  // relay running in chrome extension
                content:    'content',              // relay running in content script
                page:       'page',                 // relay running on web page
                iframe:     'iframe',               // relay running in iframe
                iframe_shim:'iframe_shim',          // relay running in an iframe shim (see readme)
                test:       'test'                  // relay for unit testing
            }),
            LEVEL_ORDER = Object.freeze({           // ordering of levels (indicitive of how messages can bubble up/down)
                service_worker: 4,
                content:        3,
                page:           2,
                iframe_shim:    1,
                iframe:         0,
                test:           -1
            }),
            level = relayLevel;                          // relay level (one of 'content','page','iframe','extension') - the level that THIS relay is listening at

        let _receivedMessages = {},                      // digest of all received messages by msgId, which is cleaned out every 2 mins to keep memory usage down
            _receivedMsgCleanTmo = null,                 // tmo for setTimeout call used to clean _receivedMessages digest every 2 minutes
            _receivedMsgCleanIntervalSecs = 2*60,        // 2 mins between digest cleaning intervals
            _relayNamespace = namespace,                 // the namespace for your msg relay - used to capture and identify relay msgs from other postMsg traffic "docalytics.message";   //
            _lastSender = null,                          // info about the last message sender
            _lastMsg = null,                             // the last received message (type, component, namespace))
            _listeners = {},                             // bound listeners for the relay (at this level)
            // _contentScriptsReady = {},                // used by extension level only, to track what content scripts in tabIds are ready
            _contentScriptConnectPort = null,            // used by content script level only, to hold variable for chrome.rumtime port to extension
            _onComponentInitializedFns = [],             // FNs to call when a component is initialized. Format is (componentName, iframeRef, windowRef)
            _componentEnvData = {},                      // hash of env data to pass to iframed components when they initialize (only used in content)
            _componentLocalOverride = false;             // For testing/debug, short-circuit actual component inti lifecycle

        const COMPONENT_STATE_NS = '_CSTATE';
        const COMPONENT_STATE = Object.freeze({
            ready: 'ready',
            initEnv: 'initEnv',
            initialized: 'initalized'
        });
        const _components = {};
        const MSG_ID_ASSIGNMENT_DELIM = "@@@";
        const COMPONENT_NAME_ALL_PREFIX = "***";

        // =============== START OF TEST-ONLY VARIABLE DEFS ====================



        // =============== END OF TEST-ONLY VARIABLE DEFS ====================

        // This function allows you to bind any msg type as a listener, and will ping the callback when the message comes to this level (exposed as <instance>.on)
        // you can also namespace msg types with msgType.namespace, or specify no namespace
        // limitFrom_level allows you to limit the incoming messages that listener will fire on for security purposes
        function _bind( msgTypes, cb, limitFromLevels= null, isOnce=false, componentFilter = null){
            if( typeof msgTypes === 'string' ) msgTypes = [msgTypes];
            if(limitFromLevels && !Array.isArray(limitFromLevels)) limitFromLevels = [limitFromLevels];

            msgTypes.forEach((msgType) =>{
                let mtypeInfo = _getMtypeInfo(msgType);
                if(!(mtypeInfo.type in _listeners)) _listeners[mtypeInfo.type] = [];
                _listeners[mtypeInfo.type].push({
                    fn: cb,
                    ns: mtypeInfo.namespace,
                    limitFromLevels,
                    componentFilter,
                    isOnce
                });
            });
        }

        //this function allows you to unbind any msg type as a listener (with a sepcified namespace or ALL events of this type(s) if no namespace is supplied)
        function _unbind(msgTypes, componentId=null){
            // TODO handle componentId ? (might not be needed)
            if(componentId){}

            if(!msgTypes) return;
            if( typeof msgTypes === 'string' ) msgTypes = [msgTypes];

            msgTypes.forEach((msgType) => {
                let mtypeInfo = _getMtypeInfo(msgType);

                if(mtypeInfo.type in _listeners){
                    if(!mtypeInfo.namespace){
                        //unbind ALL listeners on this message type
                        delete _listeners[mtypeInfo.type];
                    }else{
                        //find only messages bound on this namespace/type
                        _unbindNamspaceListenersForMessageType( mtypeInfo.type, mtypeInfo.namespace );
                    }
                }
            });
        }

        function _buildComponentStateMsgType(type, componentId){
            return _buildMsgTypeFromParts(type, COMPONENT_STATE_NS, componentId);
        }

        function _buildMsgTypeFromParts(type, namespace=null, componentId=null){
            let msgType = type;
            if(namespace) msgType += '.' + namespace;
            if(componentId){
                msgType += `[${componentId}]`;
            }
            return msgType;
        }

        //this function parses message type into component parts (type && namespace)
        function _getMtypeInfo(msgType){
            // possible formats:
            // 'foo'            - standard message
            // 'foo.bar'        - namespaced message
            // 'foo.bar[@baz]   - namespace message with component (also non namespaced w/ component)

            // NOTE this also splits message ID off
            msgType = msgType.split(MSG_ID_ASSIGNMENT_DELIM)[0];

            let type = null, namespace = null, component = null;

            const re = /^([\w:_-]+)\.?([\w:_-]+)?(\[(.+)])?$/;
            const matches = msgType.match(re);
            if(matches[2]){
                namespace = matches[2];
                type = matches[1];
            }else{
                type = matches[1];
            }
            if(matches[4]) component = matches[4];

            return {type, namespace, component};
        }

        //utility function to unbind all namespaced listeners for supplied message type
        function _unbindNamspaceListenersForMessageType( msgType, namespace ){
            if(!(msgType in _listeners)) return;
            _listeners[msgType] = _listeners[msgType].filter(l => l.ns !== namespace);
            if(!_listeners[msgType].length) delete _listeners[msgType];
        }

        //this function unbinds ALL listeners, or all listeners for a specific namespace
        function _unbindAll( namespace ){
            if( !namespace){
                _listeners = {};
            }else{
                for(let msgType in _listeners){
                    _unbindNamspaceListenersForMessageType(msgType, namespace);
                }
            }
        }

        function _buildMsgId(dest, msgType){
            return `${dest}:${msgType}${MSG_ID_ASSIGNMENT_DELIM}${_guid()}`;
        }

        //get the base msg object used for relaying
        function _getMsg( type, dest, sourceLevel, up, data ){
            // try stringify and parse message data to make sure nothing invalid is included
            data = _validateData(data);

            // type = string, message type (specified when calling send_up or send_down)
            // dest = destination level (one of LEVELS) - NOTE: can specific a specific tab.id to use only by specifying a @tab.id
            // sourceLevel = origin source level where message was sent from
            // up = boolean, is this message going upwards (else going down)
            // data = javascript variable to pass with message
            let msgId = ('msgId' in data) ? data.msgId : _buildMsgId(dest, type);
            data.msgId = msgId;
            let msgObj = {
                msgType:            type,
                msgFrom:            level,
                sourceLevel:        sourceLevel,
                msgDestination:     dest,
                msgUp:              up,
                relayNamespace:     _relayNamespace,
                msgData:            data,
                msgId:              msgId,
                msgTabId:           null
            };
            const destObj = _parseDestination(dest);
            if( destObj.tabId ){
                msgObj.msgDestination = destObj.level;
                msgObj.msgTabId = destObj.tabId;
            }
            return msgObj;
        }

        // send a message reponse to the last component message received
        function _componentRespond(msgType, data){
            const last = _lastMsg;
            if(last.component) {
                _sendMsg(msgType, LEVELS.iframe, data, last.component);
            }
        }

        //send a message to the specified level(s) - NOTE destinations can be a string or array of destination strings
        function _sendMsg( msgType, destinations, data, componentId=null ){
            data = _validateData(data);

            if( typeof destinations === 'string' ) destinations = [destinations];

            if(componentId) {
                const mtypeParts = _getMtypeInfo(msgType);
                msgType = _buildMsgTypeFromParts(mtypeParts.type, mtypeParts.namespace, componentId);
            }

            destinations.forEach((dest) => {
                if( !_isValidDestination(dest) ){
                    return _log(`NOTICE - invalid level specified as destination (${dest})`);
                }

                const destLevel = _parseDestination(dest).level;

                if (LEVEL_ORDER[destLevel] < LEVEL_ORDER[level]) {
                    _sendDown(msgType, dest, data);
                } else {
                    _sendUp(msgType, dest, data);
                }

            });
        }

        //send a message DOWN the listening stack (exposed as <instance>.send_down)
        function _sendDown( msgType, destination, data= {}){
            const msg = _getMsg( msgType, destination, level, false, data );
            _log( `Send msg DOWN from ${level} to ${destination} : ${msgType} - ${JSON.stringify(data)}`);
            _relay(msg);
        }

        //send a message UP the listening stack (exposed as <instance>.send_up)
        function _sendUp( msgType, destination, data ){
            const msg = _getMsg( msgType, destination, level, true, data );
            _log( `Send msg UP from ${level} to ${destination} : ${msgType} - ${JSON.stringify(data)}`);
            _relay(msg);
        }

        //fn to relay a message from thisLevel either up/down (using appropriate method baesd on data.msgDestination)
        function _relayFromToLevel(thisLevel, msg){

            /*
            TODO -- fix for service worker
            if( thisLevel === LEVELS.service_worker){
                // TODO
            }else
            */
            if( (thisLevel === LEVELS.content && msg.msgDestination === LEVELS.service_worker) || thisLevel === LEVELS.service_worker ){
                //going UP form content script to extension. use connected runtime port




                    // verify that message is coming from script within your extension
                    // NOTE this will prevent external connectible messages from outside your extension,
                    // but we want that for security reasons

                    if(_contentScriptConnectPort) {
                        _contentScriptConnectPort.postMessage(msg);
                    }

            }else{
                //no interaction with extension background, broadcast UP w/ postmessage so content/page can receive
                if( thisLevel === LEVELS.iframe || (msg.msgDestination !== LEVELS.iframe && thisLevel === LEVELS.iframe_shim)) {



                        globals.parent.postMessage(msg, targetDomain);

                }else if( (thisLevel === LEVELS.page || thisLevel === LEVELS.content) && [LEVELS.iframe, LEVELS.iframe_shim].includes(msg.msgDestination)){
                    //going DOWN from content/page to iframe, so postMessage to iframe(s) directly





                        const iframes = document.getElementsByTagName('iframe');
                        const {component} = _getMtypeInfo(msg.msgType);
                        for(let i=0; i<iframes.length; i++){

                            // TODO -- handle specific `component` logic here
                            if(component && !component.startsWith(COMPONENT_NAME_ALL_PREFIX)){
                                // if this message is targetted at a specific component only send to that iframe
                                // NOTE this might be overkill as it'll get filtered out in the iframe relays anyway,
                                // it just keeps down chatter
                                if(iframes[i].getAttribute(_componentIdDataAttr(component)) !== COMPONENT_STATE.ready){
                                    continue;
                                }
                            }

                            let target = '*';
                            if(level === LEVELS.content) {
                                // If sending from content, only send the message to iframes in our extension
                                target = "chrome-extension://" + chrome.runtime.id;
                                if (!iframes[i].src.startsWith(target)) continue;
                            }
                            // TODO -- handle whitelisting domains if NOT shimming???
                            iframes[i].contentWindow.postMessage(msg, target);
                        }

                }else{
                    // communication between content and page directly (UP or DOWN) or from content to iframe_shim or iframe_shim to iframe





                        // determine target and set targetOrigin appropriately
                        if(msg.msgDestination === LEVELS.iframe && thisLevel === LEVELS.iframe_shim){
                            // sending DOWN to sub-frames from iframe shim
                            // NOTE this makes the assumption that we want to post to all sub-frames within the shim
                            // if we want to restrict which frames it is passed to, this will need to change
                            for (let i=0; i < globals.frames.length; i++) {
                                globals.frames[i].postMessage(msg, "*");
                            }
                        }else {
                            globals.postMessage(msg, "*");
                        }

                }
            }
        }

        //This function is used by both send_up and send_down to relay a message the proper direction
        function _relay( msgObj){
            _relayFromToLevel( level, msgObj );
        }

        //This function is called for every incoming message to this level and determines if the messsage is intended for this level
        //(and calls needed listeners) or continues relaying it upwards/downwards
        function _incomingMessage( msg, sender ){
            //searialize/unserialize msg object so we don't end up with closure memory leaks, then assign
            const {msgData, msgFrom, sourceLevel, msgUp, msgDestination, msgType, msgId} = msg;

            //set last sender & last message type
            if(sender) _lastSender = sender;
            _lastMsg = _getMtypeInfo(msgType);

            const msgReceptionId = `${msgId}:${msgDestination}`;

            if(msgFrom === level || (msgReceptionId in _receivedMessages)){
                // Message already received - need this because page scripts and content scripts listen at same
                // postMessage level and we don't want to relay it twice if it's a pass-through
                return false;
            }

            if( msgDestination === level ){
                // Message intended for this level, call any bound listeners
                _log( `Msg (${msgType}) received from ${msgFrom} to ${msgDestination} - ${JSON.stringify(msgData)}` );
                _receivedMessages[msgReceptionId] = 0;




                    _callBoundListeners( msgType, msgData, sourceLevel );

            }else{
                // Message still bubbling up/down, just relay if needed
                msg.msgFrom = level;




                    if(msgUp && LEVEL_ORDER[level] > LEVEL_ORDER[msgFrom]){
                        _relay( msg );
                        _log( `Msg (${msgType}) relaying UP from ${msgFrom} to ${msgDestination} - ${JSON.stringify(msgData)}` );
                    }else if(!msgUp && LEVEL_ORDER[level] < LEVEL_ORDER[msgFrom]){
                        _relay( msg );
                        _log( `Msg (${msgType}) relaying DOWN ${msgFrom} to ${msgDestination} - ${JSON.stringify(msgData)}` );
                    }

            }
        }

        // convert a component ID like 'Name{12313123123}' to a data attribute friendly value
        function _componentIdDataAttr(component){
            return "relay-component-" + component.replace(/[\W]/g,'-').replace(/-+$/,'');
        }

        // parse a component's name from it's ID
        function _componentNameFromId(id){
            // format is 'componentName{GUID-ID-..}'
            const matches = id.match(/^(.+){[a-z0-9-]+}$/);
            return matches ? matches[1] : null;
        }

        //call all bound listeners for this message type at this level
        function _callBoundListeners( msgType, msgData, sourceLevel ){
            // handle special component-case messages

            // strip msgId from data
            delete msgData.msgId;
            delete msgData.msg_id; // for LEGACY messages from v2

            const {component, namespace, type} = _getMtypeInfo(msgType);

            if(component){
                if([LEVELS.content, LEVELS.page], LEVELS.iframe_shim.includes(level)){
                    // Handle specific reception cases in parent (CONTENT/PAGE)

                    const cWindow = _lastSender;
                    const iframe = Array.from(document.getElementsByTagName("iframe")).find(ifr => {
                        return ifr.contentWindow === cWindow;
                    });

                    if (namespace === COMPONENT_STATE_NS) {
                        // receiving a component status message from iframe/shimmed iframe componenet to content
                        if (type === COMPONENT_STATE.ready) {
                            _log(`Component ${component} is ready`);
                            // when an iframe component says it's ready, send down the initEnv data and mark the component as
                            // existing in that specific frame

                            const dataAttr = _componentIdDataAttr(component);
                            iframe.setAttribute(dataAttr, COMPONENT_STATE.ready);

                            let new_msgType = _buildComponentStateMsgType(COMPONENT_STATE.initEnv, component);
                            return _sendDown(new_msgType, LEVELS.iframe, _componentEnvData);
                        }
                        if (type === COMPONENT_STATE.initialized) {
                            // when iframe is component is fully initialized, set the component ID on the iframe and alert
                            // any fire an explicity call to component ready listeners
                            // TODO
                            // _lastSender is event.source -- it *SHOULD* be a window object
                            // use that to verify that the window has a component ID marked as present in this iframe
                            // via the data-relay-component-ids attribute!
                            const compName = _componentNameFromId(component);
                            _onComponentInitializedFns.forEach(item => {
                                if(item.name_filter && compName.localeCompare(item.name_filter) !== 0) return;
                                item.fn(compName, iframe, _lastSender);
                            });
                        }
                        // TODO -- anything else?
                    }
                }
            }

            if(!(type in _listeners)) return;

            const listeners = _listeners[type];
            for(let i=listeners.length-1; i >=0; i--){
                const listener = listeners[i];
                const limitFrom = listener.limitFromLevels;
                if(!limitFrom || limitFrom.includes(sourceLevel)){

                    if(component && [LEVELS.page, LEVELS.content, LEVELS.iframe_shim].includes(level)) {
                        const listenerCompFilter = listener.componentFilter;

                        if (listenerCompFilter !== COMPONENT_NAME_ALL_PREFIX) {
                            const filterCheck = listenerCompFilter || "";
                            if(!filterCheck.startsWith(COMPONENT_NAME_ALL_PREFIX) && component !== listenerCompFilter){
                                // message targetted at a specific component ID, and this aint it
                                return;
                            }
                            if(filterCheck.startsWith(COMPONENT_NAME_ALL_PREFIX)){
                                // at this point we know it's a name-targetted component like '***COMPONENT_NAME'
                                const compName = _componentNameFromId(component);
                                if (compName !== listenerCompFilter.replace(COMPONENT_NAME_ALL_PREFIX, '')) {
                                    // componenet name for this listener does NOT match the target
                                    return;
                                }
                            }

                        }
                    }

                    listener.fn.call( listener, msgData );
                    if(listener.isOnce) listeners.splice(i, 1);
                }
            }
        }

        //check if a level is an actual context level (or level w/ tab.id)
        function _isValidDestination(dest){
            if(!dest) return false;
            return (_parseDestination(dest).level in LEVELS);
        }

        //function to parse a destination address and return level (and optionally set tab.id)
        function _parseDestination(dest){
            let parts = dest.split("@");
            let tabId = parts.length > 0 ? parseInt(parts[1],10) : null;
            return {
                level:  parts[0],
                tab_id: tabId, // legacy support
                tabId
            };
        }

        // validate that data is actual encodable JSON and make a copy
        function _validateData(data){
            if(data === null || data === undefined) data = {};
            if(typeof data !== 'object'){
                throw new ChromeExtensionMessageRelayError("Data payload for message must be an object");
            }
            let newData;
            try{
                newData = JSON.parse(JSON.stringify(data));
            }catch(e){
                throw new ChromeExtensionMessageRelayError("Data payload for message included non-JSON-serizable data");
            }
            return newData;
        }

        //function to direct a message through channels via specific tab.id
        function _levelViaTabId( level, tabId ){
            return `${level}@${tabId}`;
        }

        // Function to direct a message through channels specific to an iframe w/ a containing component
        function _levelViaComponentId( componentId ) {
            return `${level}@${componentId}`;
        }

        //log function (that fires only if debug is enabled)
        function _log( msg ){
            if(!_debug) return;
            console.log(`::MSG-RELAY (${level}):: ${msg}`);
        }

        //fn to mock an incoming message to the relay (as if incoming from a different level) - useful for testing
        //funcitonality tied to bound listeners in applications that use the relay
        function _localSendMsg( msgType, data, componentId=null){
            data = _validateData(data);
            if(componentId) {
                const mtypeParts = _getMtypeInfo(msgType);
                msgType = _buildMsgTypeFromParts(mtypeParts.type, mtypeParts.namespace, componentId);
            }

            const msg = _getMsg( msgType, level, level,true, data );
            msg.msgFrom = 'mock';
            _incomingMessage( msg, {tabId: 999} );
        }


        function _componentSend( msgType, data={}, componentName=null, forceLocal=false ){
            const mtypeParts = _getMtypeInfo(msgType);
            const componentFilter = COMPONENT_NAME_ALL_PREFIX + (componentName || '');
            msgType = _buildMsgTypeFromParts(mtypeParts.type, mtypeParts.namespace, componentFilter);
            if(level === LEVELS.iframe || forceLocal){
                return _localSendMsg( msgType, data);
            }
            _sendDown(msgType, LEVELS.iframe);
        }

        function _componentOn (msgType, componentName, cb, isOnce=false){
            if(![LEVELS.page, LEVELS.content, LEVELS.iframe_shim].includes(level)){
                throw new ChromeExtensionMessageRelayError("Cannot bind component on listeners in this level");
            }
            const targetComponent = COMPONENT_NAME_ALL_PREFIX + componentName;
            _bind(msgType, cb, [LEVELS.iframe, LEVELS.iframe_shim], isOnce, targetComponent );
        }

        function _deleteInterval(){
            const   DELETE = 1,
                MARK_FOR_NEXT_ROUND_DELETE = 0;

            for(let msgId in _receivedMessages){
                if(_receivedMessages[msgId] === MARK_FOR_NEXT_ROUND_DELETE){
                    _receivedMessages[msgId] = DELETE;
                }else{
                    delete _receivedMessages[msgId];
                }
            }
        }

        //setup _receivedMessages clear interval, where we clean 2 intervals ago IDs up and mark this batches
        //for deletion in the next interval
        function _setupReceivedMsgCleanInterval(){
            _receivedMsgCleanTmo = setInterval(_deleteInterval, (_receivedMsgCleanIntervalSecs * 1000) );
        }
        _setupReceivedMsgCleanInterval();

        function _clearTmo(){
            clearInterval(_receivedMsgCleanTmo);
        }

        function _guid(){
            return Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15);
        }

        // =============== START OF TEST-ONLY FUNCTIONALITY ====================


        //fn to check current env and throw error if we are NOT in test env







        //fn to pass in an internal token, check that we are in a test ENV, and return reference to token

















        //create custom error class
        function ChromeExtensionMessageRelayError(message) {
            this.name = 'ChromeExtensionMessageRelayError';
            this.message = message || 'Error in chrome extension message relay';
            this.stack = (new Error()).stack;
        }
        ChromeExtensionMessageRelayError.prototype = Object.create(Error.prototype);
        ChromeExtensionMessageRelayError.prototype.constructor = ChromeExtensionMessageRelayError;






        if(level === LEVELS.content || level === LEVELS.service_worker){
            // if specifying content level, verify this is running in an extension content or BG page to prevent spoofing
            if(!chrome || !chrome.runtime || !chrome.runtime.id){
                let msg = `ERROR - invalid context detected for ${level}, aborting.`;
                throw new ChromeExtensionMessageRelayError(msg);
            }
        }

        // =============== END OF TEST-ONLY FUNCTIONALITY ====================

        // LEGACY handling -- when v2 message relay messages are passed in, they keys are now different
        // NOTE -- this only allows v3 relays to RECIEVE v2 messages, *NOT* send messages to v2
        const translateFromLegacyMessageFormat = (msg) => {
            if('msg_namespace' in msg){
                let translated = {};
                for(let key in msg){
                    if(key === 'msg_namespace'){
                        translated.relayNamespace = msg.msg_namespace;
                    }else{
                        // convert from old camel case to snake case keys
                        const newKey = key.replace(/_[a-z]/g, letter => `${letter.toUpperCase()}`.replace("_",''));
                        translated[newKey] = msg[key];
                    }
                }
                return translated;
            }else{
                return msg;
            }
        };

        if( level !== LEVELS.test ){
            //if NOT in test ENV, bind needed listeners for appropriate ENV to wire things up

            if( [LEVELS.page, LEVELS.content, LEVELS.iframe, LEVELS.iframe_shim].includes(level)){
                //this relay is in the page, content, or iframe level so setup listener for postmessage calls
                globals.addEventListener('message', (event) => {
                    if(typeof event.data !== 'object') return;
                    const msg = translateFromLegacyMessageFormat(event.data);

                    // IGNORE stuff that isn't part of relay traffic, for this namespace
                    if('relayNamespace' in msg && (msg.relayNamespace === _relayNamespace)){
                        _incomingMessage( msg, event.source );
                    }
                });
            }
            if(level === LEVELS.content){
                /*
                TODO - fix for service worker
                _log('Alerting extension of ready');
                _contentScriptConnectPort = chrome.runtime.connect({name: namespace});
                _contentScriptConnectPort.onMessage.addListener((msg) => {
                    _incomingMessage(msg);
                });
                */
            }
            if(level === LEVELS.service_worker){
                /*
                TODO - fix for service worker
                // every time a content script connects, mark the channel as ready!
                chrome.runtime.onConnect.addListener((event) => {
                    if(event.name !== namespace || event.sender.id !== chrome.runtime.id) return;
                    _markContentScriptReady(event);
                });
                */
            }
        }

        const RETURNS = {
            levels: LEVELS,                 // Get list of available levels
            curLevel: () => {
                return level;
            },
            on: _bind,                      // Bind listener for msg event
            onOnce: (msgTypes, cb, limitFromLevels= null) => {  // Bind listener for a single callback
                _bind(msgTypes, cb, limitFromLevels, true);
            },
            off: (msgTypes) => {            // Unbind listener for msg event
                _unbind(msgTypes);
            },
            componentOff: (msgTypes, componentId) => {
                _unbind(msgTypes, componentId);
            },
            offAll: _unbindAll,             // Unbind all listeners at this level
            send: _sendMsg,                 // Send message to specific level(s)
            levelViaTabId: _levelViaTabId,  // Send message to specific level (on tabId channel only)
            levelViaComponentId: _levelViaComponentId,
            getLastMsgSenderInfo: () => {   // Get the sender info for last received message
                return _lastSender;
            },
            getLastMsgType: () => {         // Get the msg type for last received message
                return _lastMsg.type;
            },
            getLastMsg: () => {
                return _lastMsg;
            },
            mockSend: _localSendMsg,        // Mock an incoming message to this level, useful for testing apps that use script
            localSend: _localSendMsg,       // Fire event to a local listener (on this level)
            componentSend: _componentSend,  // Fire an event to all components, or optionally named components
            componentLocalSend: (msgType, data={}, componentName=null) => {
                _componentSend(msgType, data, componentName, true);
            },
            componentOn: _componentOn,
            componentRespond: _componentRespond,
            clearTMO: _clearTmo,
            registerComponentInitializedCb: (fn, nameFilter=null) => {
                _onComponentInitializedFns.push({fn, name_filter: nameFilter});
            },
            setComponentEnvData: (envData) => {
                _componentEnvData = envData;
            },
            setOverrideLocalComponentInit: (envData) => {
                _componentEnvData = envData;
                _componentLocalOverride = true;
            },
            getComponentEnvData: () => {
                return _componentEnvData;
            }

        };

        class Component{
            constructor(relay, componentName, debug=false) {
                this.enabled = true;
                this._relay = relay;
                this._componentName = componentName;
                this._componentId = `${componentName}{${_guid()}}`; // format 'component{GUID}'
                this._debug = debug;
                this._ready = false;
                this._initialized = false;
                this._pendingInitCalls = [];
                this._limitLevels = [this._relay.levels.page, this._relay.levels.content, this._relay.levels.iframe_shim];
            }

            get _initMsg(){
                return `${COMPONENT_STATE.initEnv}.${COMPONENT_STATE_NS}`;
            }

            markReady(initEnvCallback=null){

                const _ = (cb) => {
                    if (this._ready) return;
                    this._log("markReady");
                    if (!this.enabled) return;

                    const initReturn = (envData) => {
                        cb(envData);
                        while (this._pendingInitCalls.length) {
                            let call = this._pendingInitCalls.shift();
                            call.cb(call.data);
                        }
                        this.off(this._initMsg); // TODO - might we wanna call this more than once???
                    };
                    if(_componentLocalOverride){
                        initReturn(_componentEnvData);
                    }else {
                        this.on(this._initMsg, initReturn);
                        this.send(`${COMPONENT_STATE.ready}.${COMPONENT_STATE_NS}`);
                    }
                    this._ready = true;
                };

                if(!initEnvCallback){
                    return new Promise((resolve) => {
                        _(resolve);
                    });
                }
                return _(initEnvCallback);
            }

            markInitialized(){
                if(this._initialized) return;
                this._log("MarkInitialized");
                if(!this.enabled) return;
                this._initialized = true;
                this.send(`${COMPONENT_STATE.initialized}.${COMPONENT_STATE_NS}`);
            }

            _log(...args) {
                if(!this._debug) return;
                if(args){}
                const items = Array.from(arguments);
                items.unshift(`[${!this.enabled? 'DISABLED ' : ''}COMPONENT ${this._componentId}`);
                console.warn(...items);
            }

            onOnce(msgType, cb){
                this.on(msgType, cb, true);
            }

            on(msgType, cb, onOnce=false){
                this._log(`>>> .on${onOnce ? 'Once' : ''}`, msgType);
                if(!this.enabled) return;
                this._relay.on(msgType, (data) => {
                    this._log('>>> .on called', msgType, data);
                    if(!this._ready && msgType !== this._initMsg){
                        // queue calls until component is ready
                        return this._pendingInitCalls.push({cb, data});
                    }
                    cb(data);
                }, this._limitLevels, onOnce, this._componentId);
            }

            send(msgType, data= {}){
                this._log(`>>> .send`, msgType, data);
                if(!this.enabled) return;
                this._relay.send(msgType, this._limitLevels, data, this._componentId);
            }

            off(msgTypes){
                this._log(`>>> .off`, msgTypes);
                this._relay.componentOff(msgTypes, this._componentId);
            }

            // TODO -- implement all the offAll, etc
        }

        RETURNS.newComponent = (component_name, debug=false) => {
            if(level !== LEVELS.iframe && !_componentLocalOverride){
                throw new ChromeExtensionMessageRelayError("You can only create a component in an iframe level.");
            }
            let component = new Component(RETURNS, component_name, debug);
            _components[component.id] = component;
            return component;
        };

        return RETURNS;
    };

    if (('undefined' !== typeof module) && module.exports) {    /*REM_MODULE*/
        //publish for node                                      /*REM_MODULE*/
        module.exports = relay;                                 /*REM_MODULE*/
    }else{                                                      /*REM_MODULE*/
        //publish for browser/extension                         /*REM_MODULE*/
        if(!('chromeExtensionMessageRelay' in globals)) {        /*REM_MODULE*/
            globals.chromeExtensionMessageRelay = globals.chrome_extension_message_relay = relay;   /*REM_MODULE*/
        }                                                       /*REM_MODULE*/
    }                                                           /*REM_MODULE*/
    return relay;
})(typeof this !== 'undefined' ? this : (typeof window === 'undefined' ? {} : window));
