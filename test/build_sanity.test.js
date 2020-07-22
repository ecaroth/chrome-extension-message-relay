"use strict";

var expect = require('expect.js'),
	chrome_extension_message_relay = require('../build/message_relay.build.module.js').relay;

//This suite is a simple sanity check to verify that prod built version of the script with 
//test functionality removed, and minified, is still an actual working script and doesn't throw
//any errors

require('jsdom-global')();

describe("Sanity check for prod build", function(){

	var RELAY;

	beforeEach(() => {
		RELAY = chrome_extension_message_relay("sanity.check", "page");
	});

	afterEach(() => {
		RELAY.clearTMO();
	});

	it("can bind listeners and mock response", function(done){

		var payload = {foo: "bar"};

		function cb( data ){
			expect(data).to.eql(payload);
			expect(RELAY.getLastMsgType()).to.be("check");
			expect(RELAY.getLastMsgSenderInfo().tabId).to.be(999);
			done();
		}

		RELAY.on("check.msg", cb);
		RELAY.mockSend("check", payload);

	});

});
