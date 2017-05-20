/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const Preferences = require("preferences");

Object.defineProperties(exports, {
	PROXY_OPTIONAL: {
		value: 0,
		enumerable: true
	},
	PROXY_PREFERRED: {
		value: 1,
		enumerable: true
	},
});

class ProxyInfo {
	get kind() {
		return exports.PROXY_OPTIONAL;
	}
	get type() {
		throw Error("Not implemented");
	}
	get host() {
		throw Error("Not implemented");
	}
	get port() {
		throw Error("Not implemented");
	}
	get resolve() {
		return true;
	}
	get user() {
		return null;
	}
	get password() {
		return null;
	}
	toString() {
		if (this.user) {
			return `${this.type}://${this.user}:<redacted>@${this.host}:${this.port}/${this.resolve}`;
		}
		return `${this.type}://${this.host}:${this.port}/${this.resolve}`;
	}
}
exports.ProxyInfo = ProxyInfo;

class SimpleProxyInfo extends ProxyInfo {
	constructor(kind, type, host, port, resolve, user, password) {
		super();
		this._kind = kind === exports.PROXY_PREFERRED ? kind : exports.PROXY_OPTIONAL;
		this._type = type || "";
		this._host = host || "";
		this._port = port || 0;
		if (resolve !== undefined) {
			this._resolve = !!resolve;
		}
		else {
			this._resolve = true;
		}
		this._user = user || null;
		this._password = password || null;
		if (!this._type || !this._host || !this._port) {
			throw new Error("Unsupported arguments in SimpleProxyInfo");
		}
	}
	get kind() {
		return this._kind;
	}
	get type() {
		return this._type;
	}
	get host() {
		return this._host;
	}
	get port() {
		return this._port;
	}
	get resolve() {
		return this._resolve;
	}
	get user() {
		return this._user;
	}
	get password() {
		return this._password;
	}
}
exports.SimpleProxyInfo = SimpleProxyInfo;

class ProxyProvider {
	getFor(uri) {
		throw Error("Not implemented");
	}
}
exports.ProxyProvider = ProxyProvider;

class ProxyManager {
	constructor() {
		this.providers = new Set();
		unload(() => {
			this.providers.clear();
		});
	}
	register(provider) {
		if (!(provider instanceof ProxyProvider)) {
			throw new Error("Not a valid provider");
		}
		this.providers.add(provider);
	}
	unregister(provider) {
		if (!(provider instanceof ProxyProvider)) {
			throw new Error("Not a valid provider");
		}
		this.providers.delete(provider);
	}
	_convert(proxyInfo) {
		let flags = 0;
		if (proxyInfo.resolve) {
			flags |= Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST;
		}
		let user = proxyInfo.user, password = proxyInfo.password;
		if (user && password) {
			log(LOG_DEBUG, "proxy has login");
			return Services.pps.newProxyInfoWithAuth(
				proxyInfo.type,
				proxyInfo.host,
				proxyInfo.port,
				user,
				password,
				0,
				0xffffffff,
				null);
		}
		return Services.pps.newProxyInfo(
			proxyInfo.type,
			proxyInfo.host,
			proxyInfo.port,
			flags,
			0xffffffff,
			null);
	}
	_getFor(uri) {
		let rv = null;
		let picked = null;
		for (let provider of this.providers) {
			try {
				let pi = provider.getFor(uri);
				if (!pi) {
					continue;
				}
				if (!(pi instanceof ProxyInfo)) {
					throw new Error("Not a valid ProxyInfo");
				}
				if (pi.kind === exports.PROXY_PREFERRED) {
					rv = this._convert(pi);
					picked = pi;
					break;
				}
				if (!rv) {
					rv = this._convert(pi);
					picked = pi;
				}
			}
			catch (ex) {
				log(LOG_DEBUG, "proxy provider threw", ex);
			}
		}
		if (picked) {
			log(LOG_DEBUG, `ProxyManager: picked ${picked}`);
		}
		return [rv, picked];
	}
	getFor(uri) {
		return this._getFor(uri)[0];
	}
	getInfoFor(uri) {
		return this._getFor(uri)[1];
	}
}

exports.ProxyManager = new ProxyManager();

class PrefProxyProvider extends ProxyProvider {
	constructor() {
		super();
		this._info = null;
		Preferences.addObserver("extensions.dta.proxy", this);
		this.observe();
	}
	observe() {
		let type = Preferences.getExt("proxy.type", "");
		let host = Preferences.getExt("proxy.host", "");
		let port = Preferences.getExt("proxy.port", 0);
		let resolve = Preferences.getExt("proxy.resolve", true);
		let user = Preferences.getExt("proxy.user", "");
		let password = Preferences.getExt("proxy.password", "");
		if (!type || !host || !port) {
			this._info = null;
			return;
		}
		this._info = new SimpleProxyInfo(
			exports.PROXY_PREFERRED,
			type,
			host,
			port,
			resolve,
			user,
			password);
	}
	getFor(uri) {
		return this._info;
	}
}

exports.ProxyManager.register(new PrefProxyProvider());
