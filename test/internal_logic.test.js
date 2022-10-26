"use strict";

var expect = require('expect.js'),
	chrome_extension_message_relay = require('../build/message_relay.build.test.js').relay;

//This suite tests some of the internal logic of the chrome extension message relay

describe("Internal logic", function(){
	
	var RELAY;

	beforeEach(() => {
		RELAY = chrome_extension_message_relay( "test.namespace", "test", true );
	});

	afterEach(() => {
		RELAY.clearTMO();
	});

	describe("Mock message functionality", function(){
		//This test verifies that messages passed into the relay to mock behavior (i.e. when testing an app
		//that is using the message relay) work correctly

		it("Mock incoming messages work correctly", function( done ){

			var payload = {foo: "bar"};

			function cb( data ){
				expect(data).to.eql(payload);
				expect(RELAY.getLastMsg().type).to.be('test');
				expect(RELAY.getLastMsg().namespace).to.be('msg');
				expect(RELAY.getLastMsgSenderInfo().tabId).to.be(999);
				done();
			}

			RELAY.on("test.msg", cb);
			RELAY.mockSend("test.msg", payload);
		});

	});

	describe("Received messages cache hash cleaning interval", function(){
		this.timeout(3000);

		//test the logic behind receiving/storing new messages in the hash and the logic to clear
		//it in intervals
		var _setup_received_msg_clean_interval, orig_tmo_secs;

		function _getReceivedMessages(){
			return RELAY.test.token("_receivedMessages");
		}

		it("cache cleaning works over multiple intervals", function(){
			expect(_getReceivedMessages()).to.eql({});
			//stop the tmo so we can do setup
			RELAY.clearTMO();

			// set some that should NOT be deleted to mimic some coming in during this interval
			// and some existing that are pending deletion on the next interval
			// 0 = MARK_FOR_NEXT_ROUND_DELETE, 1 = DELETE
			var received = {'foo': 0, 'bar': 0, 'biz': 1, 'baz': 1};
			RELAY.test.setRecMsg(received);
			expect(_getReceivedMessages()).to.eql(received);
			
			// run 1 interval and make sure stuff marked for deletion was deleted
			RELAY.test.token('_deleteInterval()');
			var m = _getReceivedMessages();
			expect(m.foo).to.be(1);
			expect(m.bar).to.be(1);
			expect('biz' in m).to.be.false;
			expect('baz' in m).to.be.false;

			// now run 1 more interval and make sure that the newly marked items for deletion were deleted
			RELAY.test.token('_deleteInterval()');
			expect( _getReceivedMessages() ).to.eql({});
		});
	});
	
});
