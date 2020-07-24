export function relay(e: any, t: any, n: any, i: any): {
    levels: Readonly<{
        extension: string;
        content: string;
        page: string;
        iframe: string;
        iframe_shim: string;
        test: string;
    }>;
    on: (e: any, t: any, n?: any) => void;
    off: (e: any) => void;
    offAll: (e: any) => void;
    send: (e: any, t: any, n: any) => void;
    levelViaTabId: (e: any, t: any) => string;
    getLastMsgSenderInfo: () => any;
    getLastMsgType: () => any;
    mockSend: (e: any, t: any) => void;
    localSend: (e: any, t: any) => void;
    clearTMO: () => void;
};
