// Type definitions for ./dist/message_relay.prod.module.js
// Project: [LIBRARY_URL_HERE] 
// Definitions by: [YOUR_NAME_HERE] <[YOUR_URL_HERE]> 
// Definitions: https://github.com/borisyankov/DefinitelyTyped
// relay.!ret

/**
 * 
 */
declare interface Ret {
	
	/**
	 * 
	 */
	levels : {
				
		/**
		 * 
		 */
		extension : string;
				
		/**
		 * 
		 */
		content : string;
				
		/**
		 * 
		 */
		page : string;
				
		/**
		 * 
		 */
		iframe : string;
				
		/**
		 * 
		 */
		iframe_shim : string;
				
		/**
		 * 
		 */
		test : string;
	}
		
	/**
	 * 
	 * @param e 
	 * @param n 
	 */
	on(e : RelayRet.On0, n : any): void;
		
	/**
	 * 
	 * @param e 
	 */
	off(e : RelayRet.Off0): void;
		
	/**
	 * 
	 * @param e 
	 */
	offAll(e : any): void;
		
	/**
	 * 
	 * @param e 
	 * @param n 
	 * @param t 
	 */
	send(e : any, n : RelayRet.Send1, t : any): void;
		
	/**
	 * 
	 * @param e 
	 * @param n 
	 * @return  
	 */
	levelViaTabId(e : any, n : any): string;
		
	/**
	 * 
	 * @return  
	 */
	getLastMsgSenderInfo(): RelayRet.GetLastMsgSenderInfoRet;
		
	/**
	 * 
	 */
	getLastMsgType(): void;
		
	/**
	 * 
	 * @param e 
	 * @param n 
	 */
	mockSend(e : any, n : RelayRet.MockSend1): void;
		
	/**
	 * 
	 */
	localSend : /* relay.!ret.mockSend */ any;
}
declare namespace RelayRet{
	// relay.!ret.on.!0
	type On0 = Array</* relay.!ret.on.!0 */ any>;
}
declare namespace RelayRet{
	// relay.!ret.off.!0
	type Off0 = Array</* relay.!ret.off.!0 */ any>;
}
declare namespace RelayRet{
	// relay.!ret.send.!1
	type Send1 = Array</* relay.!ret.send.!1 */ any>;
}
declare namespace RelayRet{
	// relay.!ret.getLastMsgSenderInfo.!ret
	
	/**
	 * 
	 */
	interface GetLastMsgSenderInfoRet {
				
		/**
		 * 
		 */
		tabId : number;
	}
}
declare namespace RelayRet{
	// relay.!ret.mockSend.!1
	
	/**
	 * 
	 */
	interface MockSend1 {
				
		/**
		 * 
		 */
		msg_id : string;
	}
}

/**
 * 
 * @param e 
 * @param n 
 * @param t 
 * @return  
 */
declare function relay(e : any, n : any, t : any): Ret;
