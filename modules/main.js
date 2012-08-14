/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const Preferences = require("preferences");
const Version = require("version");
const {defer} = require("support/defer");
const Mediator = require("support/mediator");
const DTA = require("api");
const Utils = require("utils");

/**
 * AboutModule
 */
const ABOUT_URI = 'https://about.downthemall.net/%BASE_VERSION%/?locale=%LOCALE%&app=%APP_ID%&version=%APP_VERSION%&os=%OS%';

function AboutModule() {
}
AboutModule.prototype = {
	classDescription: "DownThemAll! about module",
	classID: Components.ID('{bbaedbd9-9567-4d11-9255-0bbae236ecab}'),
	contractID: '@mozilla.org/network/protocol/about;1?what=downthemall',

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

	newChannel : function(aURI) {
		try {
				if (!Version.ready) {
					throw new Exception("Cannot build about:downthemall, version module not ready");
				}

				let ru = ABOUT_URI.replace(
					/%(.+?)%/g,
					function (m, m1) (m1 in Version) ? Version[m1] : m
				);

				let uri = Services.io.newURI(ru, null, null);
				let chan = Services.io.newChannelFromURI(uri);
				chan.originalURI = aURI;

				let sec = Cc['@mozilla.org/scriptsecuritymanager;1'].getService(Ci.nsIScriptSecurityManager);
				try {
					chan.owner = sec.getSimpleCodebasePrincipal(uri);
				}
				catch (ex) {
					chan.owner = sec.getCodebasePrincipal(uri);
				}
				return chan;
		}
		catch (ex) {
			log(LOG_ERROR, "failed to create about channel", ex);
			throw ex;
		}
	},
	getURIFlags: function(aURI) Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT
};

function MetalinkInterceptModule() {
}
MetalinkInterceptModule.prototype = {
	classDescription: "DownThemAll! metalink integration",
	classID: Components.ID('{4b048560-c789-11e1-9b21-0800200c9a67}'),
	contractID: '@mozilla.org/streamconv;1?from=application/metalink4+xml&to=*/*',
	QueryInterface: XPCOMUtils.generateQI([
		Ci.nsISupports,
		Ci.nsIStreamConverter,
		Ci.nsIContentSniffer,
		Ci.nsIStreamListener,
		Ci.nsIRequestObserver
	]),
	xpcom_categories: ["net-content-sniffers", "content-sniffing-services", "@mozilla.org/streamconv;1"],
	testMetaDoc: /^\s*<\?xml(?:.|\r|\n)*?xmlns(?::.+?)?=('|")(?:http:\/\/www\.metalinker\.org\/|urn:ietf:params:xml:ns:metalink)\1/im,

	getMIMETypeFromContent: function(req, data, length) {
		data = String.fromCharCode.apply(null, data);
		if (this.testMetaDoc.test(data)) {
			if (req instanceof Ci.nsIHttpChannel) {
				req.setResponseHeader("Content-Disposition", "", false);
			}
			return "application/metalink4+xml";
		}
		return "";
	},
	asyncConvertData: function(fromType, toType, listener, ctx) {
		this.listener = listener;
	},
	convert: function() {
		throw Cr.NS_ERROR_NOT_IMPLEMENTED;
	},

	onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
		try {
			this.pipe.outputStream.writeFrom(aInputStream, aCount);
		}
		catch(ex) {
			aRequest.cancel(Cr.NS_BINDING_ABORTED);
		}
	},
	onStartRequest: function(aRequest, aCtx) {
		this.pipe = new Instances.Pipe(false, true, 1<<17, 160, null);
	},
	onStopRequest: function(aRequest, aCtx, aStatusCode) {
		const {parse} = require("support/metalinker");

		try {
			this.listener.onStopRequest(aRequest, aCtx, aStatusCode);
		}
		catch (ex) {}

		let is = new Instances.BinaryInputStream(this.pipe.inputStream);
		try {
			if (!Components.isSuccessCode(aCtx)) {
				throw "Error downloading metalink document";
			}
			let buf = "";
			for (let a; a = is.available();) {
				buf += is.readBytes(a);
			}
			buf = "data:application/metalink4+xml;base64," + btoa(buf);
			parse(Services.io.newURI(buf, null, null), "", function(res, ex) {
				if (ex) {
					log(LOG_ERROR, "failed", ex);
					throw ex;
				}
				if (!res.downloads.length) {
					log(LOG_ERROR, "no downloads");
					throw new Error(_("mlnodownloads"));
				}
				let window = Mediator.getMostRecent();
				window.openDialog(
					"chrome://dta/content/dta/manager/metaselect.xul",
					"_blank",
					"chrome,centerscreen,dialog=yes",
					res.downloads,
					res.info,
					function() {
						Utils.filterInSitu(res.downloads, function(d) { return d.selected; });
						log(LOG_DEBUG, res.downloads);
						if (res.downloads.length) {
							log(LOG_DEBUG, "going");
							DTA.sendLinksToManager(window, res.info.start, res.downloads);
						}
					}
				);
			});
		}
		catch (ex) {
			log(LOG_ERROR, "ml", ex);
		}
		finally {
			this.pipe.outputStream.close();
			is.close();
			this.listener = null;
			this.pipe = null;
		}
	}
};
function registerComponents() {
	for (let [,cls] in Iterator([AboutModule, MetalinkInterceptModule])) {
		const factory = {
			_cls: cls,
			createInstance: function(outer, iid) {
				if (outer) {
					throw Cr.NS_ERROR_NO_AGGREGATION;
				}
				return new this._cls();
			}
		};
		Cm.registerFactory(cls.prototype.classID, cls.prototype.classDescription, cls.prototype.contractID, factory);
		unload(function() {
			Cm.unregisterFactory(factory._cls.prototype.classID, factory);
		});

		if (cls.prototype.xpcom_categories) {
			for each (let category in cls.prototype.xpcom_categories) {
				Services.catman.addCategoryEntry(category, cls.prototype.classDescription, cls.prototype.contractID, false, true);
			}
		}
	}

}

function migrate() {
	/*
	 * Various migration
	 */
	const fn1_0 = [
		function() {
			// 1.0.1: #613 Multiple "slow-down" reports
			log("resetting connection prefs");
			for each (let e in ['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server']) {
				Preferences.reset(e);
			}
		},
	];

	(function migrate() require("version").getInfo(function(v) {
		try {
			let lastVersion = Preferences.getExt('version', '0');
			if (0 == v.compareVersion(v.BASE_VERSION, lastVersion)) {
				return;
			}
			if (v.compareVersion(lastVersion, "1.0.1") < 0) {
				fn1_0.forEach(function(fn) fn());
			}
			Preferences.setExt('version', v.BASE_VERSION);

			v.showAbout = true;
			Services.obs.notifyObservers(null, v.TOPIC_SHOWABOUT, null);

			// Need to extract icons
			require("support/iconcheat").loadWindow(null);
		}
		catch (ex) {
			log(LOG_ERROR, "MigrationManager", ex);
			try {
				Preferences.resetExt("version");
			}
			catch (iex) {
				// XXX
			}
		}
	}))();
}

exports.clean = function clean() {
	log(LOG_INFO, 'clean()');

	// Cleaning prefs
	for each (let e in ['directory', 'filter', 'renaming']) {
		try {
			Preferences.resetExt(e);
		}
		catch (ex) {
			log("Cannot clear pref: " + e, ex);
		}
	}

	// Cleaning files
	try {
		let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
		for each (let e in ['dta_history.xml']) {
			try {
				var file = prof.clone();
				file.append(e);
				if (file.exists()) {
					file.remove(false);
				}
			}
			catch (ex) {
				log(LOG_ERROR, 'Cannot remove: ' + e, ex);
			}
		}
	}
	catch (oex) {
		log(LOG_ERROR, 'failed to clean files: ', oex);
	}

	// Diagnostic log
	try {
		log.clear();
	}
	catch (ex) {
		log(LOG_ERROR, "Cannot clear diagnostic log", ex);
	}

	try {
		require("manager/queuestore").QueueStore.clear();
	}
	catch (ex) {
		log(LOG_ERROR, "Cannot clear queue", ex);
	}
}

const unloadObserver = {
	observe: function() {
		Services.obs.removeObserver(this, "profile-change-teardown");

		let branch = Preferences.getBranch('privacy.');
		// has user pref'ed to sanitize on shutdown?
		if (branch.getBoolPref('sanitize.sanitizeOnShutdown') && branch.getBoolPref('clearOnShutdown.extensions-dta')) {
			exports.clean();
		}
	}
};
Services.obs.addObserver(unloadObserver, "profile-change-teardown", false);
unload(function sanitizeUnload() unloadObserver.observe());

function registerTools() {
	require("support/contenthandling");
	// Need to defer dhICore, as it may be registered after were running
	defer(function() {
		if (("dhICore" in Ci) && ("dhIProcessor" in Ci)) {
			require("support/downloadHelper");
		}
	});
	require("support/scheduleautostart");
}

function registerOverlays() {
	function elementsStub(window, document) {
		function $(id) document.getElementById(id);
		function fire(event) {
			fire._runUnloaders();

			Components.utils.import("chrome://dta-modules/content/glue.jsm", {})
				.require("loaders/integration")
				.load(window, event);
		}
		function maybeInsertButtons(ids) {
			// Simply need to get the currentset attribute, which will still contain
			// the id and reset it and tb.currentSet
			try {
				for (let [,tb] in Iterator(document.getElementsByTagName("toolbar"))) {
					let tcs = tb.getAttribute("currentset").split(",");
					if (!ids.some(function(id) ~tcs.indexOf(id))) {
						continue;
					}
					tb.currentSet = tcs.join(",");
					tb.setAttribute("currentset", tb.currentSet);
					tb.ownerDocument.persist(tb.id, "currentset");
					log(LOG_DEBUG, "buttons restored in " + tb.id);
					return;
				}
			}
			catch (ex) {
				log(LOG_DEBUG, "maybeInsertButtons failed for " + ids, ex);
			}
		}
		log(LOG_DEBUG, "running elementsStub");

		window.setTimeout(function dta_firewalkswithme() {
			fire._unloaders = [];
			fire._runUnloaders = function() {
				for (let i = 0; i < fire._unloaders.length; ++i) {
					try {
						fire._unloaders[i]();
					}
					catch (ex) {
					}
				}
				fire._unloaders = [];
			};
			fire.addFireListener = function(elem, type) {
				if (!elem) {
					return;
				}
				fire._unloaders.push(function() elem.removeEventListener(type, fire, false));
				elem.addEventListener(type, fire, false);
			};
			fire.addFireListener($("dtaCtxCompact").parentNode, "popupshowing");
			fire.addFireListener($("dtaToolsMenu").parentNode, "popupshowing");
			fire.addFireListener($("dta-button"), "command");
			fire.addFireListener($("dta-button"), "popupshowing");
			fire.addFireListener($("dta-turbo-button"), "command");
			fire.addFireListener($("dta-turbo-button"), "popupshowing");
			fire.addFireListener($("dta-turboselect-button"), "command");
			fire.addFireListener($("dta-manager-button"), "command");
			fire.addFireListener($("cmd_CustomizeToolbars"), "command");
			unload(function() fire._runUnloaders());
		}, 100);

		window.setTimeout(function dta_showabout() {
			function dta_showabout_i() {
				function openAbout() {
					fire(null);
					Version.showAbout = false;
					window.setTimeout(function() require("support/mediator").showAbout(window), 0);
				}
				function registerObserver() {
					Services.obs.addObserver({
						observe: function(s,t,d) {
							Services.obs.removeObserver(this, Version.TOPIC_SHOWABOUT);
							if (Version.showAbout) {
								openAbout();
							}
						}
					}, Version.TOPIC_SHOWABOUT, true);
				}

				try {
					if (Version.showAbout === null) {
						registerObserver();
						return;
					}
					if (Version.showAbout === true) {
						openAbout();
						return;
					}
				}
				catch (ex) {
				}
			}
			dta_showabout_i();
		}, 2000);

		log(LOG_DEBUG, "running elementsStub");

		maybeInsertButtons(["dta-button", "dta-turbo-button", "dta-turboselect-button", "dta-manager-button"]);
	}
	const {registerOverlay, watchWindows, unloadWindow} = require("support/overlays");
	registerOverlay("chrome://dta/content/integration/elements.xul", "chrome://browser/content/browser.xul", elementsStub);
	registerOverlay("chrome://dta/content/integration/elements.xul", "chrome://navigator/content/navigator.xul", elementsStub);
	watchWindows("chrome://global/content/customizeToolbar.xul", function(window, document) {
		let ss = document.createProcessingInstruction("xml-stylesheet", 'href="chrome://dta/skin/integration/style.css" type="text/css"');
		document.insertBefore(ss, document.documentElement);
		unloadWindow(window, function() ss.parentNode.removeChild(ss));
	});

	registerOverlay("chrome://dta/content/integration/saveas.xul", "chrome://mozapps/content/downloads/unknownContentType.xul", function(window, document) {
		require("loaders/saveas").load(window, document);
	});
	watchWindows("chrome://browser/content/preferences/sanitize.xul", function(window, document) {
		const PREF = 'privacy.clearOnShutdown.extensions-dta';
		try {
			let prefs = document.getElementsByTagName('preferences')[0];
			let pref = document.createElement('preference');
			pref.setAttribute('id', PREF);
			pref.setAttribute('name', PREF);
			pref.setAttribute('type', 'bool');
			prefs.appendChild(pref);

			let rows = document.getElementsByTagName('rows');
			rows = rows[rows.length - 1];

			let msg = Services.strings.createBundle('chrome://dta/locale/sanitize.properties')
				.GetStringFromName('sanitizeitem');

			let check = document.createElement('checkbox');
			check.setAttribute('label', msg);
			check.setAttribute('preference', PREF);

			let row = document.createElement('row');
			row.appendChild(check);
			rows.appendChild(row);

			pref.updateElements();
		}
		catch (ex) {
			Components.utils.reportError(ex);
		}
	});
	registerOverlay("chrome://dta/content/privacy/overlaySanitize191.xul", "chrome://browser/content/sanitize.xul", function(window, document) {
		if ('Sanitizer' in window) {
			window.Sanitizer.prototype.items['extensions-dta'] = {
				clear: function() {
					try	{
						exports.clean();
					}
					catch (ex) {
						log(LOG_ERROR, "Failed to clean", ex);
						Components.utils.reportError(ex);
					}
				},
				get canClear() {
					return true;
				}
			};
		}
		let msg = Services.strings.createBundle('chrome://dta/locale/sanitize.properties')
			.GetStringFromName('sanitizeitem');
		document.getElementById('dtaSanitizeItem').setAttribute('label', msg);
	});
}

exports.main = function main() {
	log(LOG_INFO, "running main");

	registerComponents();

	migrate();

	registerTools();

	registerOverlays();

}
