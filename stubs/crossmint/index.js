import React from 'react';

export const CrossmintProvider = ({ children }) => React.createElement(React.Fragment, null, children);
export const CrossmintAuthProvider = ({ children }) => React.createElement(React.Fragment, null, children);
export const CrossmintWalletProvider = ({ children }) => React.createElement(React.Fragment, null, children);
export const EmbeddedAuthForm = () => React.createElement('div', { style: { color: '#6c779d', padding: '16px', textAlign: 'center', fontFamily: 'sans-serif', fontSize: '14px' } }, 'Crossmint auth unavailable in this environment');
export const useWallet = () => ({ wallet: null, status: 'not-connected' });
export const useAuth = () => ({ user: null, status: 'unauthenticated' });
export default {};
