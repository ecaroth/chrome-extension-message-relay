"use strict";

var expect = require('expect.js'),
	chrome_extension_message_relay = require('../build/message_relay.build.test.js').relay;

//This suite tests each individual internal function of the chrome extension message relay class
//to ensure expeted functionality. NOTE this tests ALL internal functions, not just those exposed and
//documented in the API. It does this by leveraging a .test property, which allows getting/setting of
//variables in the class and also returning internal token references via eval. PLEASE NOTE that for the
//production build of the script, the .text property is nullified so none of the test functions are
//accessible

describe("Individual internal functions", function(){

	var RELAY;

	beforeEach(() => {
		RELAY = chrome_extension_message_relay("test", "test");
	});

	afterEach(() => {
		RELAY.clearTMO();
	});

	function _get_listeners(){
		return RELAY.test.getListeners();
	}
	function _set_listeners(val){
		RELAY.test.setListeners(val || {});
	}
	function _msg_base( from_lvl, to_lvl ){
		var _orders = RELAY.test.token("LEVEL_ORDER");
		return {
			msgType:           'foobar',
            msgFrom:           from_lvl,
            msgDestination:    to_lvl,
            msgUp:             _orders[from_lvl] < _orders[to_lvl],
            msgNamespace:      null,
            msgData:           {foo: "bar"},
            msgId:             'sample_id',
            msgTabId:         null
		};
	}

	describe("_incomingMessage", function(){
		var _incomingMessage;
		var resp = null;

		beforeEach(function(){
			_incomingMessage = RELAY.test.token('_incomingMessage');
			resp = null;
			RELAY.test.setResponseFn(function( rtype, msg ){
				resp = { rtype: rtype, msg: msg };
			});
		});

		afterEach(function(){
			RELAY.test.setResponseFn( null );
		});

		it("message from each level to other levels bubbles", function(){
			for(var level_a in RELAY.levels){
				for(var level_b in RELAY.levels){
					if(level_a !== level_b && level_a !== RELAY.levels.test && level_b !== RELAY.levels.test){
						resp = null;
						var msg = _msg_base( level_a, level_b );
						expect( _incomingMessage(msg, null, null) ).to.be.true;
						expect( resp.rtype ).to.be( "bubble" );
						expect( resp.msg.msgFrom ).to.be( RELAY.levels.test );
					}
				}
			}
		});

		it("message for this level calls bound listeners", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.test );
			expect( _incomingMessage(msg, null, null) ).to.be.true;
		});

		it("messages with same ID aren't processed twice", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.content);

			expect( _incomingMessage(msg, null, null) ).to.be.true;
			expect( _incomingMessage(msg, null, null) ).to.be.false;
		});
	});

	describe("_callBoundListeners", function(){
		var _callBoundListeners;

		beforeEach(() => {
			_callBoundListeners = RELAY.test.token('_callBoundListeners');
		})

		it("bound listeners get called correctly ", function(done){
			var edata = {foo:"bar"};
			function cb(data){
				expect(data).to.eql(edata);
				done();
			}
			_set_listeners({'baz': [{fn:cb, ns:null}]});
			_callBoundListeners( 'baz', edata );
		});
	});

	describe("_getMtypeInfo", function(){
		var _getMtypeInfo;

		beforeEach(() => {
			_getMtypeInfo = RELAY.test.token('_getMtypeInfo');
		});

		it("type and namespace are parsed", function(){
			var mt = _getMtypeInfo("foo.bar");
			expect(mt.type).to.be("foo");
			expect(mt.namespace).to.be("bar");
		});

		it("type is parsed with no namespace", function(){
			var mt = _getMtypeInfo("foo");
			expect(mt.type).to.be("foo");
			expect(mt.namespace).to.be.null;
		});

		it("component is parsed properly", function(){
			var mt = _getMtypeInfo("foo.bar[@baz]");
			expect(mt.type).to.be("foo");
			expect(mt.namespace).to.be("bar");
			expect(mt.component).to.be("@baz");
		});

	});

	describe('_setupReceivedMsgCleanInterval', function(){
		var _setupReceivedMsgCleanInterval;

		beforeEach(() => {
			_setupReceivedMsgCleanInterval = RELAY.test.token('_setupReceivedMsgCleanInterval');
		})

		it("calling funciton sets TMO interval", function(){
			//clear existing
			RELAY.clearTMO();
			var tmo = RELAY.test.token('_receivedMsgCleanTmo');
			expect(tmo).to.be.null;
			_setupReceivedMsgCleanInterval();
			tmo = RELAY.test.token('_receivedMsgCleanTmo');
			expect(tmo).to.not.be.null;
		})
	});

	describe('_unbindNamspaceListenersForMessageType', function(){
		var _unbindNamspaceListenersForMessageType;

		beforeEach(() => {
			_unbindNamspaceListenersForMessageType = RELAY.test.token('_unbindNamspaceListenersForMessageType');
		});

		it("unbinds listener for specific mtype and namespace", function(){
			_set_listeners({
				'foo': [{fn:null, ns:null}, {fn:null, ns:'ns1'}],
				'bar': [{fn:null, ns:null}, {fn:null, ns:'ns1'}, {fn:null, ns:'ns2'}]
			});
			_unbindNamspaceListenersForMessageType( 'bar', 'ns1' );
			var l = _get_listeners();
			expect(l.foo.length).to.be(2);
			expect(l.bar.length).to.be(2);
		});
	});

	describe('_relayFromToLevel', function(){
		var _relayFromToLevel;
		var last_relay = null;

		beforeEach(() => {
			last_relay = null;
			_relayFromToLevel = RELAY.test.token('_relayFromToLevel');
			RELAY.test.setResponseFn(function( relay_type, data ){
				last_relay = {type: relay_type, data: data};
			});
		});

		afterEach(() => {
			RELAY.test.setResponseFn(null);
		});

		/*
		it("message from extension to iframe gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.extension, RELAY.levels.iframe );
			_relayFromToLevel( RELAY.levels.extension, msg, function(){} );
			expect(last_relay.type).to.be("extension_down");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from extension to page gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.extension, RELAY.levels.page );
			_relayFromToLevel( RELAY.levels.extension, msg, function(){} );
			expect(last_relay.type).to.be("extension_down");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from extension to content gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.extension, RELAY.levels.content );
			_relayFromToLevel( RELAY.levels.extension, msg, function(){} );
			expect(last_relay.type).to.be("extension_down");
			expect(last_relay.data.msgType).to.be("foobar");
		});
		 */

		it("message from content to iframe gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.content, RELAY.levels.iframe );
			_relayFromToLevel( RELAY.levels.content, msg, function(){} );
			expect(last_relay.type).to.be("iframe_down");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from content to page gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.content, RELAY.levels.page );
			_relayFromToLevel( RELAY.levels.content, msg, function(){} );
			expect(last_relay.type).to.be("page_content_down");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		/*
		it("message from content to extension gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.content, RELAY.levels.extension );
			_relayFromToLevel( RELAY.levels.content, msg, function(){} );
			expect(last_relay.type).to.be("content_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from page to extension gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.extension );
			_relayFromToLevel( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("page_content_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});
		 */

		it("message from page to content gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.content );
			_relayFromToLevel( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("page_content_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from page to iframe_shim is relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.iframe_shim );
			_relayFromToLevel( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("iframe_shim_down");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from page to iframe is relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.iframe );
			_relayFromToLevel( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("iframe_down");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from page to content gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.content );
			_relayFromToLevel( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("page_content_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		/*
		it("message from iframe to extension gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.extension );
			_relayFromToLevel( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});
		 */

		it("message from iframe to content gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.content );
			_relayFromToLevel( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from iframe to page gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.page );
			_relayFromToLevel( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});

		it("message from iframe to iframe_shim gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.iframe_shim );
			_relayFromToLevel( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msgType).to.be("foobar");
		});
	});
		
	describe('_levelViaTabId', function(){

		it("formats destination w/ tab ID", function(){
			var lvl = RELAY.test.token('_levelViaTabId')(RELAY.levels.test, 1234);
			expect(lvl).to.be("test@1234");
		});
	});
	
	describe('_getMsg', function(){
		var _getMsg;

		beforeEach(() => {
			_getMsg = RELAY.test.token('_getMsg');
		});

		it("msg object is created correctly", function(){
			var msg = _getMsg( "foobar", RELAY.levels.page, 'test', true, {biz:"baz"} );
			expect(msg.msgType).to.be("foobar");
			expect(msg.msgFrom).to.be("test");
			expect(msg.msgDestination).to.be(RELAY.levels.page);
			expect(msg.msgUp).to.be(true);
			expect(msg.msgId).to.not.be.null;
			expect(msg.msgTabId).to.be.null;
			expect(msg.msgData).to.eql({biz:"baz", msgId:msg.msgId});
		});

		it("msg object preserves msgId", function(){
			var msg = _getMsg( "foobar", RELAY.levels.page, 'test', true, {biz:"baz",msgId:"foobar"} );
			expect(msg.msgId).to.be("foobar");
			//expect(msg.msgId.split("@@@")[0].split(":")[0]).to.be(RELAY.levels.page);
			//expect(msg.msgId.split("@@@")[0].split(":")[1]).to.be("foobar");
		});

		it("tab ID is extrapolated from destination", function(){
			var msg = _getMsg( "foobar", RELAY.levels.page+"@1234", true, 'test', {biz:"baz", msgId:"foobar"} );
			expect(msg.msgDestination).to.be(RELAY.levels.page);
			expect(msg.msgTabId).to.be(1234);
		});
	});

	describe('_bind', function(){
		var _bind;

		beforeEach(() => {
			_bind = RELAY.test.token('_bind');
		});

		beforeEach(function(){
			RELAY.test.token('_unbindAll')();
			expect(_get_listeners()).to.eql({});
		});

		it("bind single event to new message type with namespace", function(){
			var cb = function(){};
			_bind("foo.bar", cb);
			var l = _get_listeners();
			expect(l.foo.length).to.be(1);
			expect(l.foo[0].fn).to.be(cb);
			expect(l.foo[0].ns).to.be("bar");
		});

		it("bind single event to new message type with no namespace", function(){
			var cb = function(){};
			_bind("foo", cb);
			var l = _get_listeners();
			expect(l.foo.length).to.be(1);
			expect(l.foo[0].fn).to.be(cb);
			expect(l.foo[0].ns).to.be(null);
		});

		it("bind two events to different message types", function(){
			var cb1 = function(){},
				cb2 = function(){};
			_bind("foo", cb1);
			_bind("bar", cb2);
			var l = _get_listeners();
			expect(l.foo.length).to.be(1);
			expect(l.foo[0].fn).to.be(cb1);
			expect(l.bar.length).to.be(1);
			expect(l.bar[0].fn).to.be(cb2);
		});

		it("bind two events to same message type, 1 including namespace", function(){
			var cb1 = function(){},
				cb2 = function(){};
			_bind("foo", cb1);
			_bind("foo.bar", cb2);
			var l = _get_listeners();
			expect(l.foo.length).to.be(2);
			expect(l.foo[0].fn).to.be(cb1);
			expect(l.foo[0].ns).to.be.null;
			expect(l.foo[1].fn).to.be(cb2);
			expect(l.foo[1].ns).to.be("bar");
		});

		it("bind single event on multiple types with no namespace", function(){
			var cb = function(){};
			_bind(["foo","bar"], cb);
			var l = _get_listeners();
			expect(l.foo.length).to.be(1);
			expect(l.foo[0].fn).to.be(cb);
			expect(l.foo[0].ns).to.be(null);
			expect(l.bar.length).to.be(1);
			expect(l.bar[0].fn).to.be(cb);
			expect(l.bar[0].ns).to.be(null);
		});

		it("bind single event on multiple types with with 2 different namespaces", function(){
			var cb = function(){};
			_bind(["foo.biz","bar.baz"], cb);
			var l = _get_listeners();
			expect(l.foo.length).to.be(1);
			expect(l.foo[0].fn).to.be(cb);
			expect(l.foo[0].ns).to.be("biz");
			expect(l.bar.length).to.be(1);
			expect(l.bar[0].fn).to.be(cb);
			expect(l.bar[0].ns).to.be("baz");
		});
	});

	describe('_unbindAll', function(){
		var _unbindAll;

		beforeEach(function(){
			_unbindAll = RELAY.test.token('_unbindAll');

			//set some default/expected pre-bound listeners
			_set_listeners({
				'foo': [{fn:null, ns:null}, {fn:null, ns:'ns1'}],
				'bar': [{fn:null, ns:null}, {fn:null, ns:'ns1'}, {fn:null, ns:'ns2'}]
			});
			var l = _get_listeners();
			expect(l.foo.length).to.be(2);
			expect(l.bar.length).to.be(3);
		});

		it("removes all listeners for a specific namespace", function(){
			_unbindAll('ns1');
			var l = _get_listeners();
			expect(l.foo.length).to.be(1);
			expect(l.bar.length).to.be(2);
		});

		it("removes all listeners with no namespace specified", function(){
			_unbindAll();
			expect(_get_listeners()).to.eql({});
		});
	});

	describe('_unbind', function(){
		var _unbind;

		beforeEach(function(){
			_unbind = RELAY.test.token('_unbind');

			//set some default/expected pre-bound listeners
			_set_listeners({
				'foo': [{fn:null, ns:null}, {fn:null, ns:'ns1'}],
				'bar': [{fn:null, ns:null}, {fn:null, ns:'ns1'}, {fn:null, ns:'ns2'}],
				'biz': [{fn:null, ns:'ns2'}]
			});
			var l = _get_listeners();
			expect(l.foo.length).to.be(2);
			expect(l.bar.length).to.be(3);
			expect(l.biz.length).to.be(1);
		});

		it("unbind message of specific type, any namespace", function(){
			_unbind('bar');
			var l = _get_listeners();
			expect(l.foo.length).to.be(2);
			expect(l.biz.length).to.be(1);
			expect('bar' in l).to.be.false;
		});

		it("unbind messages of multiple types, any namespace", function(){
			_unbind(['foo','bar']);
			var l = _get_listeners();
			expect('foo' in l).to.be.false;
			expect('bar' in l).to.be.false;
			expect(l.biz.length).to.be(1);
		});

		it("unbind messages of specific type, specific namespace", function(){
			_unbind('bar.ns2');
			var l = _get_listeners();
			expect(l.foo.length).to.be(2);
			expect(l.bar.length).to.be(2);
			expect(l.biz.length).to.be(1);
		});

	});

	describe('_isValidDestination', function(){
		var _isValidDestination;

		beforeEach(() => {
			_isValidDestination = RELAY.test.token('_isValidDestination');
		});

		it("valid levels are considered valud", function(){
			for(var level in RELAY.levels){
				expect( _isValidDestination(level) ).to.be.true;
			}
		});

		it("invalid levels are invalid", function(){
			expect( _isValidDestination('invalid') ).to.be.false;
		});
	});

	describe('_parseDestination', function(){
		var _parseDestination;

		beforeEach(() => {
			_parseDestination = RELAY.test.token('_parseDestination');
		});

		it("tabId and level are parsed", function(){
			var dest = _parseDestination("test@1234");
			expect(dest.level).to.be("test");
			expect(dest.tabId).to.be(1234);
		});

		it("level is parsed with no tabId", function(){
			var dest = _parseDestination("test");
			expect(dest.level).to.be("test");
			expect(dest.tabId).to.be.null;
		});
	});
	
});
