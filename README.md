# Chrome Extension Message Relay


A message relay class to make development of Chrome Extensions faster and easier by exposing a dead-simple communication interface between context levels (iframe, page, content scripts, background scripts). The script leverages a combination of [Chrome Message Passing](https://developer.chrome.com/apps/messaging) and [window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window.postMessage) to facilitate this communication.

*Authored by* [Evan Carothers](https://github.com/ecaroth)

Usage
------

To start using the message relay, simply include the production version of the file at `/dist/message_relay.prod.js` at  all levels of your extension you need communication to. The message relay can be used:

* In iframes on the page
* In iframes shims on the page (used to shim an iframe's contents with another iframe served from the chrome extension URL to bypass CSP restrictions in extensions that work in Gmail - see details further down in readme)
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

Installation
------

The package is available directly on github, or via package management (bower / npm):
```
bower install chrome-extension-message-relay --save
```
```
npm install git+https://github.com/ecaroth/chrome-extension-message-relay --save
```
    
Notes
------

In some cases for the relay to work properly, you must have created relays that are listening each level of the communication stack. For example, if you have a relay on the web page and one in the backgroud page, they will not be able to communicate because there meeds to also be a listener active on the content script level for that page.

Also - relays only communicate with others that were created on the same namespace, however you can create multiple relays with different namespaces for different purposes to suit your needs, though that's a very odd use case during extension development

For security, content and extension levels are verified to be running in an extension context or and error is thrown.
Additionally messages sent to iframes must be relayed through content scripts (they are discared by page level if destination level is iframe/iframe_shim, as content scripts can postmessage directly to the iframes)

API
------

You can create a new message relay at the desired level by instantiating it, passing in the namespace, current level, and if you want to run the extesion in debug mode (which provides verbose logging of incoming/relaying messages)

```javascript		
var relay = chrome_extension_message_relay(
    my_relay_namespace, // string
    current_level, // string enum(page|content|extension|iframe|iframe_shim)
    debug_mode // boolean, default false,
    target_domain // string (postMessage domain target), only used for iframe/iframe_shim level calls to limit target domain for PostMessage
);
```
        
Once created you have access to the following functions on the object:



### .on( msg_type, cb, allowed_source_levels )
> This function gives the ability to listen for incoming messages to this context level (from any other level) and execute a callback when the message is received. The bound listener executes each time the message is incoming, and stays bound until the relay is destroyed.

> `msg_type` _(string)_ name of the message you want to listen for or (array) of multiple message type strings. Note message types can be namespaced in the format 'msg_type.namespace', else left in the global namspeace

>`cb` _(function)_ callback function when message is received, takes 1 argument which is incoming message data (object)

>`allowed_source_levels` _string or array, optional_ list of levels for origin source to allow. Note that this does not work in all cases, but is primarily designed to use in background to limit message callbacks as from content scripts only (vs contexts further down the page)

> ```javascript
> my_relay.on( "save.user_action", function(data){
>     console.log("incoming message", data);    
> });
>```

### .send( msg_type, destination, data )
> This function allows a relay to send a message to a specific destination level, which will be intercepted by any listeners at that context level.

> `msg_type` _(string)_ name of the message you wish to send or (array) or multiple message types

> `destination` _(string)_ the destination level (one of the enum levels listed below) or a level/tab.id combo (see [_specific tab channels_](#specific-tab-channels) below)

> `data` _(JSON serializable object)_ data to send along with the message

> ```javascript
> my_relay.send( "save", my_relay.levels.extension, {foo:"bar"} );
> ```

### .localSend( msg_type, data )
> This function allows a relay to send a message to any listeners in the current level, and does not relay to other leves. Useful for local "event bus" style communication between components.

> `msg_type` _(string)_ name of the message you wish to send or (array) or multiple message types

> `data` _(JSON serializable object)_ data to send along with the message

> ```javascript
> my_relay.localSend( "save", {foo:"bar"} );
> ```

### .off( msg_type )
> This function allows you to unbind msg type listeners from this relay, or all message types in a namespace for this relay.

> `msg_type` _(string)_ name of the message you want to unbind or (array) of multiple message type strings. Note message types can be namespaced in the format 'msg_type.namespace', else if no namespace is supplied ALL messages of that type(s) will be unbound

> **NOTE** this function gives more specific control for unbinding based on message type - if you want to do unbinding for specific namespaces or all messages, see `offAll()` below

> ```javascript
> //unbind listeners for message type 'reload' (regardless of namespace)
> my_relay.off( "reload" );
> 
> //unbind listeners for message type 'save' in namespace 'user_action', and all listeners for message type 'notify'
> my_relay.off( ["save.user_action","notify"] );
>```

### .offAll( namespace )
> This function allows you to unbind msg type listeners from the relay, either to unbind ALL listeners, or all of a specific namespace

> `namespace` _(string, optional)_ the namespace for which you want to unbind listeners

> ```javascript
> //unbind all listeners for namespace 'user_action' (regardless of message type they are bound for)
> my_relay.offAll( "user_action" );
> 
> //unbind ALL listeners, regardless of namespace or message type
> my_relay.offAll();
> ```

### .levels
> This is simply an exposed object that allows you to explicitly reference a context level and contains the following keys you can use when leveraging the `.send()` function above:

> * iframe
> * iframe_shim
> * page
> * content
> * extension

> **NOTE** - Iframe shim is an intermediary iframe intended for use for extensions that cannot load iframes on a page due to CSP (content security policy) preventing it on page, regardless of manifest settings. This allows you to load an iframe from chrome-extension:// that just loads another iframe within to your intended SRC. The iframe_shim level lets messages flow properly from the child iframe up to the content scripts (and further up the context)

### .mockSend( msg_type, data )
> This function allows you to send a mock event to the relay as if it had received an incoming event from a different level. This is useful for building tests for applications that leverage the message relay and depend on it's functionality. 

> `msg_type` _(string)_ name of the message you wish to call bound listeners for

> `data` _(JSON serializable object, optional)_ data to send along with the message

> ```javascript
> //sent a mock message for an previously bound message type in my test suite
> my_relay.mockSend( "save", {foo:"bar"} );
> ```

Specific Tab Channels
------

In many cases you may be sending a message down to a content, page, iframe, or iframe_shim context from the extension background. The message relay will, by default, broadcast the message across all tabs so any registered listeners in your namespace can receive/forward the message. Sometimes this is desired, but not always. To broadcast a message from the extension context down to a specific tab channel, you can use a special exposed function on the message relay when specifying the destination level to indicate the tab ID you wish to broadcast to. This function is detailed below:

### .levelViaTabId( level, tab.id )
> An example of using this from the extension context, to send the message only through the currently active tab channel is:
> ```javascript
> var relay = chrome_extension_message_relay( "myextension.relay_namespace", "extension" );
> 
> chrome.tabs.getSelected(function(tab){
> 	relay.send(
> 	    "foo.bar",
> 	    relay.levelViaTabId( relay.levels.page, tab.id ),
> 	    { foo: "bar" }
> 	);
> });
> ```

A useful utility function exists to help you get the tab information for the last received message (often useful if you want to leverage the levelViaTabId function above to communicate directly back to that tab). The function is:

### .getLastMsgSenderInfo()
> This function returns the tab that last communicated with the extension. So an example of responding directly back would be:

> ```javascript
> relay.on( 'msg_from_content', function(data){
>     var _tab = relay.getLastMsgSenderInfo();
>     relay.send( 'response', relay.levelViaTabId( relay.levels.content, _tab.id), {foo:'bar'} );
> });
> ```

Development - testing & building
------

_NOTE: This section is only relevent for developers who wish to contribute to this project_

A full unit test suite exists to test/verify functionality of all internal functions of the message relay, as well as to strip some needed test functionality out and package the relay for production usage.

To use this functionality locally you must first do an `npm install`.

Development on the package takes place in _/dev/message_relay.dev.js_. There is functionality that is exposed purely for testing and should *not* be included with the packaged version. Lines to be removed for packaging are indicated with comment blocks _/\*REM\*/_, and inline comments indicate the test functionality and how it's used.

If the test/dev version of the relay is included on a page and you try to create a relay with it for any level other than _test_, a `ChromeExtensionMessageRelayError` will be thrown on the page and the relay will not function

To run the full test suite, package the relay for distribution, and run some sanity tests on the packaged build, you can run `gulp build` in the command line from the root dir of the package.
