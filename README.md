#Chrome Extension Message Relay


A message relay class to make development of Chrome Extensions faster and easier by exposing a dead-simple communication interface between context levels (iframe, page, content scripts, background scripts). The script leverages a combination of [chrome.runtime.sendMessage](https://developer.chrome.com/extensions/runtime#method-sendMessage) and [window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window.postMessage) to facilitate this communication.

*Authored by* [Evan Carothers](https://github.com/ecaroth)

Usage
------

To start using the message relay, simply include the file message_relay.js at all levels of your extension you need communication. The message relay can be used:

* In iframes on the page
* In iframes shims on the page (used to shim an iframe's contents with another iframe served from the chrome extension URL to bypass CSP restrictions in extensions that work in Gmail)
* On the page itself (injected into the page's context)
* In your content scripts
* In the extension's context (background pages/scripts)

Just create a new instance of the relay at the level you are in, passing in a namespace for your relays and the current level. For example if I had scripts injected into the current page's context and the message relay was also injected, I could set it up with:

```javascript
var my_page_msg_relay = chrome_extension_message_relay( "myextension.namespace", "page" );
```

Then, within that same page I can listen for any specific communications sent to that level by using the 'on' function:

```javascript
function my_callback_function( msg_data ){
    console.log(msg_data); //will output any data sent with this messgae
};

my_page_msg_relay.on( "foo.bar" , my_callback_function )
```    
    
Now, at any other context level of my extension I can communicate with this page script by using a message relay on that level. For example, if I setup a messgae relay in the content script level then another one in the background page, I can communicate down to the page script from the background page like so:

```javascript
var background_pg_msg_relay = chrome_extension_message_relay( "myextension.relay_namespace", "extension" );

background_pg_msg_relay.send(
    "foo.bar",
    background_pg_msg_relay.levels.page,
    { my_data: "test" }
);
```
    
Notes
------

In some cases for the relay to work properly, you must have created relays that are listening each level of the communication stack. For example, if you have a relay on the web page and one in the backgroud page, they will not be able to communicate because there meeds to also be a listener active on the content script level for that page.

Also - relays only communicate with others that were created on the same namespace, however you can create multiple relays with different namespaces for different purposes to suit your needs, though that's a very odd use case during extension development


API
------

You can create a new message relay at the desired level by instantiating it, passing in the namespace, current level, and if you want to run the extesion in debug mode (which provides verbose logging of incoming/relaying messages)

```javascript		
var relay = chrome_extension_message_relay(
    my_relay_namespace, //string
    current_level, //string enum(page|iframe|content|extension)
    debug_mode //string 
);
```
        
Once created you have access to the following functions on the object:



####.on( msg_type, cb )
This function gives the ability to listen for incoming messages to this context level (from any other level) and execute a callback when the message is received. The bound listener executes each time the message is incoming, and stays bound until the relay is destroyed.

`msg_type` (string) name of the message you want to listen for or (array) of multiple message type strings. Note message types can be namespaced in the format 'msg_type.namespace', else left in the global namspeace

`cb` = callback function when message is received, takes 1 argument which is incoming message data

####.send( msg_type, destination, data, cb )
This function allows a relay to send a message to a specific destination level, which will be intercepted by any listeners at that context level.

`msg_type` (string) name of the message you wish to send or (array) or multiple message types

`destination` (string) the destination level (one of the enum levels listed below) or a level/tab.id combo (see '*specific tab channels*' below)

`data` (object) data to send along with the message

`cb` (function) callback function that can be used by the listener to respond to the message directly. 

**NOTE** *the responder callback functionality only works when sending communications between a content script and a background script, as it leverages [chrome.runtime.sendMessage](https://developer.chrome.com/extensions/runtime#method-sendMessage)*

####.off( msg_type )
This function allows you to unbind msg type listeners from this relay, or all message types in a namespace for this relay.

`msg_type` (string) name of the message you want to unbind or (array) of multiple message type strings. Note message types can be namespaced in the format 'msg_type.namespace', else if no namespace is supplied ALL messages of that type(s) will be unbound

####.offAll( namespace )
This function allows you to unbind msg type listeners from the relay, either to unbind ALL listeners, or all of a specific namespace

`namespace` (string, optional) the namespace for which you want to unbind listeners

####.levels
This is simply an exposed object that allows you to explicitly reference a context level and contains the following keys you can use when leveraging the `.send()` function above:

* iframe
* iframe_shim
* page
* content
* extension

**NOTE** - Iframe shim is an intermediary iframe intended for use for extensions that cannot load iframes on a page due to CSP (content security policy) preventing it on page, regardless of manifest settings. This allows you to load an iframe from chrome-extension:// that just loads another iframe within to your intended SRC. The iframe_shim level lets messages flow properly from the child iframe up to the content scripts (and further up the context)

####.mockSend( msg_type, data )
This function allows you to send a mock event to the relay as if it had received an incoming event from a different level. This is useful for building tests for applications that leverage the message relay and depend on it's functionality. 

`msg_type` (string) name of the message you wish to call bound listeners for

`data` (object, optional) data to send along with the message

###Specific Tab Channels

In many cases you may be sending a message down to a content, page, iframe, or iframe_shim context from the extension background. The message relay will, by default, broadcast the message across all tabs so any registered listeners in your namespace can receive/forward the message. Sometimes this is desired, but not always. To broadcast a message from the extension context down to a specific tab channel, you can use a special exposed function on the message relay when specifying the destination level to indicate the tab ID you wish to broadcast to. This function is detailed below:
####.levelViaTabId( level, tab.id )

An example of using this from the extension context, to send the message only through the currently active tab channel is:
```javascript
var relay = chrome_extension_message_relay( "myextension.relay_namespace", "extension" );

chrome.tabs.getSelected(function(tab){
	relay.send(
	    "foo.bar",
	    relay.levelViaTabId( relay.levels.page, tab.id),
	    { my_data: "test" }
	);
});
```

A useful utility function exists to help you get the tab information for the last received message (often useful if you want to leverage the levelViaTabId function above to communicate directly back to that tab). The function is:
####.getLastMsgSenderInfo()

This function returns the tab that last communicated with the extension. So an example of responding directly back would be:

```javascript
relay.on( 'msg_from_content', function(data){
    var _tab = relay.getLastMsgSenderInfo();
    relay.send( 'response', relay.levelViaTabId( relay.levels.content, _tab.id), {foo:'bar'} );
});
```