"use strict";

var expect = require('expect.js'),
	chrome_extension_message_relay = require('../dev/message_relay.dev.js');

//This suite tests each individual internal function of the chrome extension message relay class
//to ensure expeted functionality. NOTE this tests ALL internal functions, not just those exposed and
//documented in the API. It does this by leveraging a .test property, which allows getting/setting of
//variables in the class and also returning internal token references via eval. PLEASE NOTE that for the
//production build of the script, the .text property is nullified so none of the test functions are
//accessible

describe("Individual internal functions", function(){

	var RELAY = chrome_extension_message_relay( "test", "test" );

	function _get_listeners(){
		return RELAY.test.getListeners();
	}
	function _set_listeners(val){
		RELAY.test.setListeners(val || {});
	}
	function _msg_base( from_lvl, to_lvl ){
		var _orders = RELAY.test.token("LEVEL_ORDER");
		return {
			msg_type:           'foobar',
            msg_from:           from_lvl,
            msg_destination:    to_lvl,
            msg_up:             _orders[from_lvl] < _orders[to_lvl],
            msg_namespace:      null,
            msg_data:           {foo: "bar"},
            msg_id:             'sample_id',
            msg_tab_id:         null
		};
	}

	describe("_incoming_message", function(){
		var _incoming_message = RELAY.test.token('_incoming_message');
		var resp = null;

		beforeEach(function(){
			resp = null;
		});

		before(function(){
			RELAY.test.setResponseFn(function( rtype, msg ){
				resp = { rtype: rtype, msg: msg };
			});
		});

		after(function(){
			RELAY.test.setResponseFn( null );
		});

		it("message from each level to other levels bubbles", function(){
			for(var level_a in RELAY.levels){
				for(var level_b in RELAY.levels){
					if(level_a !== level_b && level_a !== RELAY.levels.test && level_b !== RELAY.levels.test){
						resp = null;
						var msg = _msg_base( level_a, level_b );
						expect( _incoming_message(msg, null, null) ).to.be.true;
						expect( resp.rtype ).to.be( "bubble" );
						expect( resp.msg.msg_from ).to.be( RELAY.levels.test );
					}
				}
			}
		});

		it("message for this level calls bound listeners", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.test );
			expect( _incoming_message(msg, null, null) ).to.be.true;
		});

		it("messages with same ID aren't processed twice", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.content);

			expect( _incoming_message(msg, null, null) ).to.be.true;
			expect( _incoming_message(msg, null, null) ).to.be.false;
		});
	});

	describe("_call_bound_listeners", function(){
		var _call_bound_listeners = RELAY.test.token('_call_bound_listeners');

		it("bound listeners get called correctly ", function(done){
			var edata = {foo:"bar"};
			function cb(data){
				expect(data).to.eql(edata);
				done();
			}
			_set_listeners({'baz': [{fn:cb, ns:null}]});
			_call_bound_listeners( 'baz', edata );
		});
	});

	describe("_get_mtype_info", function(){
		var _get_mtype_info = RELAY.test.token('_get_mtype_info');

		it("type and namespace are parsed", function(){
			var mt = _get_mtype_info("foo.bar");
			expect(mt.type).to.be("foo");
			expect(mt.namespace).to.be("bar");
		});

		it("type is parsed with no namespace", function(){
			var mt = _get_mtype_info("foo");
			expect(mt.type).to.be("foo");
			expect(mt.namespace).to.be.null;
		});

		it("namespace with included dot is supported", function(){
			var mt = _get_mtype_info("foo.bar.baz");
			expect(mt.type).to.be("foo");
			expect(mt.namespace).to.be("bar.baz");
		});

	});

	describe('_setup_received_msg_clean_interval', function(){
		var _setup_received_msg_clean_interval = RELAY.test.token('_setup_received_msg_clean_interval');

		it("calling funciton sets TMO interval", function(){
			//clear existing
			RELAY.test.clearTMO();
			var tmo = RELAY.test.token('received_msg_clean_tmo');
			expect(tmo).to.be.null;
			_setup_received_msg_clean_interval();
			tmo = RELAY.test.token('received_msg_clean_tmo');
			expect(tmo).to.not.be.null;
		})
	});

	describe('_unbind_namspace_listeners_for_message_type', function(){
		var _unbind_namspace_listeners_for_message_type = RELAY.test.token('_unbind_namspace_listeners_for_message_type');

		it("unbinds listener for specific mtype and namespace", function(){
			_set_listeners({
				'foo': [{fn:null, ns:null}, {fn:null, ns:'ns1'}],
				'bar': [{fn:null, ns:null}, {fn:null, ns:'ns1'}, {fn:null, ns:'ns2'}]
			});
			_unbind_namspace_listeners_for_message_type( 'bar', 'ns1' );
			var l = _get_listeners();
			expect(l.foo.length).to.be(2);
			expect(l.bar.length).to.be(2);
		});
	});

	describe('_relay_from_to_level', function(){
		var _relay_from_to_level = RELAY.test.token('_relay_from_to_level');
		var last_relay = null;

		before(function(){
			RELAY.test.setResponseFn(function( relay_type, data ){
				last_relay = {type: relay_type, data: data};
			});
		});

		after(function(){
			RELAY.test.setResponseFn(null);
		});

		it("message from extension to iframe gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.extension, RELAY.levels.iframe );
			_relay_from_to_level( RELAY.levels.extension, msg, function(){} );
			expect(last_relay.type).to.be("extension_down");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from extension to page gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.extension, RELAY.levels.page );
			_relay_from_to_level( RELAY.levels.extension, msg, function(){} );
			expect(last_relay.type).to.be("extension_down");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from extension to content gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.extension, RELAY.levels.content );
			_relay_from_to_level( RELAY.levels.extension, msg, function(){} );
			expect(last_relay.type).to.be("extension_down");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from content to iframe gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.content, RELAY.levels.iframe );
			_relay_from_to_level( RELAY.levels.content, msg, function(){} );
			expect(last_relay.type).to.be("iframe_down");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from content to page gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.content, RELAY.levels.page );
			_relay_from_to_level( RELAY.levels.content, msg, function(){} );
			expect(last_relay.type).to.be("page_content_down");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from content to extension gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.content, RELAY.levels.extension );
			_relay_from_to_level( RELAY.levels.content, msg, function(){} );
			expect(last_relay.type).to.be("content_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from page to extension gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.extension );
			_relay_from_to_level( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("page_content_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from page to content gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.content );
			_relay_from_to_level( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("page_content_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from page to iframe_shim gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.iframe_shim );
			_relay_from_to_level( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("page_content_down");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from page to iframe gets relayed DOWN", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.iframe );
			_relay_from_to_level( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("iframe_down");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from page to content gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.page, RELAY.levels.content );
			_relay_from_to_level( RELAY.levels.page, msg, function(){} );
			expect(last_relay.type).to.be("page_content_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from iframe to extension gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.extension );
			_relay_from_to_level( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from iframe to content gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.content );
			_relay_from_to_level( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from iframe to page gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.page );
			_relay_from_to_level( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});

		it("message from iframe to iframe_shim gets relayed UP", function(){
			var msg = _msg_base( RELAY.levels.iframe, RELAY.levels.iframe_shim );
			_relay_from_to_level( RELAY.levels.iframe, msg, function(){} );
			expect(last_relay.type).to.be("iframe_up");
			expect(last_relay.data.msg_type).to.be("foobar");
		});
	});
		
	describe('_level_via_tab_id', function(){
		var _level_via_tab_id = RELAY.test.token('_level_via_tab_id');

		it("formats destination w/ tab ID", function(){
			var lvl = _level_via_tab_id(RELAY.levels.test, 1234);
			expect(lvl).to.be("test@1234");
		});
	});
	
	describe('_get_msg', function(){
		var _get_msg = RELAY.test.token('_get_msg');

		it("msg object is created correctly", function(){
			var msg = _get_msg( "foobar", RELAY.levels.page, true, {biz:"baz"} );
			expect(msg.msg_type).to.be("foobar");
			expect(msg.msg_from).to.be("test");
			expect(msg.msg_destination).to.be(RELAY.levels.page);
			expect(msg.msg_up).to.be(true);
			expect(msg.msg_id).to.not.be.null;
			expect(msg.msg_tab_id).to.be.null;
			expect(msg.msg_data).to.eql({biz:"baz",msg_id:msg.msg_id});
		});

		it("msg object preserves msg_id", function(){
			var msg = _get_msg( "foobar", RELAY.levels.page, true, {biz:"baz",msg_id:"foobar"} );
			expect(msg.msg_id).to.be("foobar");
		});

		it("tab ID is extrapolated from destination", function(){
			var msg = _get_msg( "foobar", RELAY.levels.page+"@1234", true, {biz:"baz",msg_id:"foobar"} );
			expect(msg.msg_destination).to.be(RELAY.levels.page);
			expect(msg.msg_tab_id).to.be(1234);
		});
	});

	describe('_bind', function(){
		var _bind = RELAY.test.token('_bind');

		beforeEach(function(){
			RELAY.test.token('_unbind_all')();
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

	describe('_unbind_all', function(){
		var _unbind_all = RELAY.test.token('_unbind_all');

		beforeEach(function(){
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
			_unbind_all('ns1');
			var l = _get_listeners();
			expect(l.foo.length).to.be(1);
			expect(l.bar.length).to.be(2);
		});

		it("removes all listeners with no namespace specified", function(){
			_unbind_all();
			expect(_get_listeners()).to.eql({});
		});
	});

	describe('_unbind', function(){
		var _unbind = RELAY.test.token('_unbind');

		beforeEach(function(){
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

	describe('_is_valid_destination', function(){
		var _is_valid_destination = RELAY.test.token('_is_valid_destination');

		it("valid levels are considered valud", function(){
			for(var level in RELAY.levels){
				expect( _is_valid_destination(level) ).to.be.true;
			}
		});

		it("invalid levels are invalid", function(){
			expect( _is_valid_destination('invalid') ).to.be.false;
		});
	});

	describe('_parse_destination', function(){
		var _parse_destination = RELAY.test.token('_parse_destination');

		it("tab_id and level are parsed", function(){
			var dest = _parse_destination("test@1234");
			expect(dest.level).to.be("test");
			expect(dest.tab_id).to.be(1234);
		});

		it("level is parsed with no tab_id", function(){
			var dest = _parse_destination("test");
			expect(dest.level).to.be("test");
			expect(dest.tab_id).to.be.null;
		});
	});
	
});
