##Chrome Extension Message Relay##


A message relay class to make development of Chrome Extensions faster and easier by exposing a dead-simple communication interface between context levels (iframe, page, content scripts, background scripts). The script leverages a combination of [chrome.runtime.sendMessage](https://developer.chrome.com/extensions/runtime#method-sendMessage) and [window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window.postMessage) to facilitate this communication.

*Authored by* [Evan Carothers](https://github.com/ecaroth) @ [Docalytics](https://github.com/orgs/Docalytics/dashboard)

###Usage
To start using the message relay, simply include the file message_relay.js at all levels of your extension you need communication. The message relay can be used:

* In iframes on the page
* On the page itself (injected into the page's context)
* In your content scripts
* In the extension's context (background pages/scripts)

Just create a new instance of the relay at the level you are in, passing in a namespace for your relays and the current level. For example if I had scripts injected into the current page's context and the message relay was also injected, I could set it up with:

```javascript
var my_page_msg_relay = message_relay( "myextension.namespace", "page" );
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
var background_pg_msg_relay = message_relay( "myextension.namespace", "extension" );

background_pg_msg_relay.send(
    "foo.bar",
    background_pg_msg_relay.levels.page,
    { my_data: "test" }
);
```
    
###Notes

For the relay to work properly, you must have created relays that are listening each level of the communication stack. For example, if you have a relay on the web page and one in the backgroud page, they will not be able to communicate because there meeds to also be a listener active on the content script level for that page.

Also - relays only communicate with others that were created on the same namespace, however you can create multiple relays with different namespaces for different purposes to suit your needs, though that's a very odd use case during extension development


###API

You can create a new message relay at the desired level by instantiating it, passing in the namespace, current level, and if you want to run the extesion in debug mode (which provides verbose logging of incoming/relaying messages)

```javascript		
var relay = message_relay( 
    my_namespace, //string
    current_level, //string enum(page|iframe|content|extension)
    debug_mode //string 
);
```
        
Once created you have access to the following functions on the object:



####.on( msg_type, cb )
This function gives the ability to listen for incoming messages to this context level (from any other level) and execute a callback when the message is received. The bound listener executes each time the message is incoming, and stays bound until the relay is destroyed.

`msg_type` (string) name of the message you want to listen for

`cb` = callback function when message is received, takes 1 argument which is incoming message data

####.send( msg_type, destination, data, cb )
This function allows a relay to send a message to a specific destination level, which will be intercepted by any listeners at that context level.

`msg_type` (string) name of the message you wish to send

`destination` (string) the destination level (one of the enum levels listed below)

`data` (object) data to send along with the message

`cb` (function) callback function that can be used by the listener to respond to the message directly. 

**NOTE** *the responder callback functionality only works when sending communications between a content script and a background script, as it leverages [chrome.runtime.sendMessage](https://developer.chrome.com/extensions/runtime#method-sendMessage)*

####.levels
This is simply an exposed object that allows you to explicitly reference a context level and contains the following keys you can use when leveraging the `.send()` function above:

* iframe
* page
* content
* extension