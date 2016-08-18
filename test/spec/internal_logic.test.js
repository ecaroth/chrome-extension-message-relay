"use strict";

var expect = require('expect.js'),
	chrome_extension_message_relay = require('../../dev/message_relay.dev.js');

//This suite tests some of the internal logic of the chrome extension message relay

describe("Internal logic", function(){

	var RELAY = chrome_extension_message_relay( "test.namespace", "test" );

	describe("Mock message functionality", function(){
		//This test verifies that messages passed into the relay to mock behavior (i.e. when testing an app
		//that is using the message relay) work correctly

		it("Mock incoming messages work correctly", function( done ){

			var payload = {foo: "bar"};

			function cb( data ){
				expect(data).to.eql(payload);
				expect(RELAY.getLastMsgType()).to.be("test");
				expect(RELAY.getLastMsgSenderInfo().tabId).to.be(999);
				done();
			}

			RELAY.on("test.msg", cb);
			RELAY.mockSend("test", payload);
		});

	});

	describe("Received messages cache hash cleaning interval", function(){
		this.timeout(3000);

		//test the logic behind receiving/storing new messages in the hash and the logic to clear
		//it in intervals
		var _setup_received_msg_clean_interval = RELAY.test.token("_setup_received_msg_clean_interval"),
			orig_tmo_secs = RELAY.test.token("received_msg_clean_interval_secs");

		function _get_received_messages(){
			return RELAY.test.token("received_messages");
		}		

		before(function(){
			//set interval of 5 seconds so we can use setTimeouts in the test to wait and check vals
			RELAY.test.setTMOsecs(1);
			RELAY.test.setRecMsg({});
		});

		after(function(){
			RELAY.test.clearTMO();
			RELAY.test.setTMOsecs(orig_tmo_secs);
			_setup_received_msg_clean_interval();
		});

		it("cache cleaning works over multiple intervals", function( done ){
			this.timeout(4000);
			expect(_get_received_messages()).to.eql({});
			//stop the tmo so we can do setup
			RELAY.test.clearTMO();

			//set some that should NOT be deleted to mimic some coming in during this interval
			//and some existing that are pending deletion on the next interval
			var received = {'foo': 0, 'bar': 0, 'biz': 1, 'baz': 1};
			RELAY.test.setRecMsg(received);
			expect(_get_received_messages()).to.eql(received);
			
			//now restart the interval and watch behavior
			_setup_received_msg_clean_interval();
			setTimeout(function(){
				//should have hit first interval and deleted those that were marked for it and
				//marked those from the last round
				var m = _get_received_messages();
				expect(m.foo).to.be(1);
				expect(m.bar).to.be(1);
				expect('biz' in m).to.be.false;
				expect('baz' in m).to.be.false;
				
				//now wait for one more interval and see if the newly marked items are deleted
				setTimeout(function(){
					expect( _get_received_messages() ).to.eql({});
					done();
				}, 1100);

			}, 1100);
		});
	});
	
});
