export function relay(t: any, n: any, i: any, s: any): {
    levels: Readonly<{
        service_worker: string;
        content: string;
        page: string;
        iframe: string;
        iframe_shim: string;
        test: string;
    }>;
    on: (e: any, t: any, n?: any, i?: any) => void;
    off: (e: any) => void;
    componentOff: (e: any, t: any) => void;
    offAll: (e: any) => void;
    send: (e: any, t: any, n: any, i?: any) => void;
    levelViaTabId: (e: any, t: any) => string;
    levelViaComponentId: (e: any) => string;
    getLastMsgSenderInfo: () => any;
    getLastMsgType: () => any;
    getLastMsg: () => any;
    mockSend: (e: any, t: any) => void;
    localSend: (e: any, t: any) => void;
    componentSend: (e: any, t: any, n?: any) => void;
    componentOn: (e: any, t: any, n: any) => void;
    componentRespond: (e: any, t: any) => void;
    clearTMO: () => void;
    registerComponentInitializedCb: (e: any, t?: any) => void;
    setComponentEnvData: (e: any) => void;
    getComponentEnvData: () => {};
};
