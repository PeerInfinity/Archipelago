// Communication protocol for window adapter - re-exports from unified shared protocol
export {
    MessageTypes,
    createMessage,
    validateMessage,
    safePostMessage,
    createErrorMessage,
    generateClientId,
    generateIframeId,
    generateWindowId
} from '../shared/communicationProtocol.js';
