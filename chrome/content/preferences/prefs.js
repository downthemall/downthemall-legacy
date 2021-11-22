/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global _, DTA, $, $$, Utils, Preferences, log, unloadWindow */
/* global Mediator, FilterManager, openUrl, alert */
/* jshint globalstrict:true, strict:true, browser:true */

var LINK_FILTER = FilterManager.LINK_FILTER;
var IMAGE_FILTER = FilterManager.IMAGE_FILTER;

var Prompts = require("prompts");

var Main = {
	load: function() {
		$('alert2').hidden = !('nsIAlertsService' in Ci);
	}
};

var Privacy = {
	load: function() {
		try {
			var logExists = DTA.getProfileFile("log.txt").exists();
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e) { e.disabled = !logExists; });

			$("butFiltDel").disabled = !DTA.getDropDownValue("filter");
			$("butFoldDel").disabled = !DTA.getDropDownValue("directory");
		}
		catch (ex) {
			log(LOG_ERROR, "privacyLoad(): ", ex);
		}

		// delay this assignment, or else we get messed up by the slider c'tor
		$('history').setAttribute('preference', 'dtahistory');
		$('dtahistory').updateElements();
	},
	changedHistory: function() {
		$('historylabel').value = $('history').value;
	},
	delFilters: function() {
		Preferences.resetExt("filter");
	},
	delDirectories: function() {
		Preferences.resetExt("directory");
	},
	showLog: function() {
		if (log.file && log.file.exists()) {
			openUrl("file://" + log.file.path);
		}
	},
	revealLog: function() {
		if (log.file && log.file.exists()) {
			Utils.reveal(log.file);
		}
	},
	deleteLog: function() {
		try {
			log.clear();
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e){ e.disabled = true; });
		}
		catch (ex) {
			alert(ex);
		}
	},
	showNotice: function() {
		Mediator.showNotice(window);
	}
};

var Advanced = {
	load: function() {
		// delay these assignments, or else we get messed up by the slider c'tor
		$('maxchunks').setAttribute('preference', 'dtamaxchunks');
		$('dtamaxchunks').updateElements();
		this.changedMaxChunks();
		$('loadendfirst').setAttribute('preference', 'dtaloadendfirst');
		$('dtaloadendfirst').updateElements();
		this.changedLoadEndFirst();
		this.toggleTemp();
	},
	browse: function() {
		// let's check and create the directory
		var tmp = $("temp");
		if (!tmp) {
			return;
		}
		Utils.askForDir(Preferences.getExt("tempLocation", tmp.value), "", function(f) {
			if (!f) {
				return;
			}
			$("temp").value = f;
			Preferences.setExt("tempLocation", f);
		});
		$("temp").focus();
	},
	toggleTemp: function() {
		$("temp").disabled = $("browsedir").disabled = !$("useTemp").checked;
	},
	getPerm: function(perm) {
		return $('dtapermissions').value & perm;
	},
	setPerm: function(perm) {
		return 384 | ($('dtapermissions').value ^ perm);
	},
	changedMaxChunks: function() {
		let v = $('maxchunks').value;
		$('maxchunkslabel').value = $('maxchunks').value;
		if (v === '1') {
			$('maxchunkslabel').value += ' / ' + _('disabled');
		}
	},
	changedLoadEndFirst: function() {
		let v = $('loadendfirst').value;
		if (v === '0') {
			$('loadendfirstlabel').value = _('disabled');
		}
		else {
			$('loadendfirstlabel').value = _('sizeKB', [$('loadendfirst').value]);
		}
	}
};

var Interface = {
	init: function(pref, which) {
		try {
			Components.utils.import("resource://mintrayr/mintrayr.jsm", {});
		}
		catch (ex) {
			$('minimizetotray').disabled = true;
			$('minimizetotray_link').hidden = false;
		}
	},
	getMenu: function(pref, which) {
		let menu = $(pref).value.split(',');
		return which in menu ? menu[which] === '1' : false;
	},
	setMenu: function(pref, which) {
		let menu = $(pref).value.split(',');
		menu[which] = $(pref + which).checked ? 1 : 0;
		return menu.toString();
	},
	openMinTrayR: function() {
		openUrl("https://addons.mozilla.org/addon/minimizetotray-revived/");
	}
};

var Filters = {
	_filters: [],
	_lastRowEdited : -1,

	Observer: {
		registerObserver: function() {
			try {
				Preferences.makeObserver(this);
				Services.obs.addObserver(this, 'DTA:filterschanged', true);
			}
			catch (ex) {
				log(LOG_ERROR, "cannot install filterManager observer!", ex);
				return false;
			}
			return true;
		},
		// nsIObserver::observe
		observe : function(subject, topic, prefName) {
			// filterManager will throw this topic at us.
			if (topic === 'DTA:filterschanged') {
				// the heavy work will be performed by changeTab..
				// it will create the filter boxen for us, and furthermore do another selection
				Filters.reloadFilters();
			}
		}
	},

	load: function() {
		this._elem = $("filterTable");
		this._elem.view = this;

		this.Observer.registerObserver();
		this.reloadFilters();
	},
	reloadFilters: function() {
		// something has changed..
		try {
			// i'm saving the old filters positions and the selected row for a later use
			var old = this._filters.map(function(f) { return f.id; } );
			var index = this.current;

			// let's get the new filters
			this._box.rowCountChanged(0, -this.rowCount);
			this._filters = [];

			for (let filter of FilterManager.enumAll()) {
				this._filters.push(filter);
			}
			this._box.rowCountChanged(0, this.rowCount);

			// if we added a new filter
			if (old.length < this._filters.length) {
				this._filters.some(
					function(f, i) {
						var idx = old.indexOf(f.id);
						if (idx === -1) {
							this.selection.select(i);
							this._box.ensureRowIsVisible(i);
							return true;
						}
						return false;
					},
					this
				);
			}
			else if (old.length === this._filters.length && index !== -1) {
				this.selection.select(index);
				this._box.scrollToRow(index);
			}
			else if (this._filters.length){
				this.selection.select(0);
			}
		}
		catch(ex) {
			log(LOG_ERROR, "reloadFilters():", ex);
		}
	},
	onCheckboxChange : function() {
		this.onFilterEdit();
		this.onFinishedFilterEdit();
	},
	onFilterEdit: function() {
		let filter = this.filter;
		let newType = ($("filterText").checked ? LINK_FILTER : 0) | ($("filterImage").checked ? IMAGE_FILTER : 0);

		if ($("filterLabel").value !== filter.label ||
			$("filterExpression").value !== filter.expression ||
			filter.type !== newType) {
			filter.label = $("filterLabel").value;
			filter.type = newType;
			filter.expression = $("filterExpression").value;

			var idx = this.selection.currentIndex;
			this.box.invalidateRow(idx);
			this._lastRowEdited = idx;
		}
	},
	onFinishedFilterEdit : function() {
		if (this._lastRowEdited !== -1) {
			this.getFilter(this._lastRowEdited).save();
			this._lastRowEdited = -1;
		}
	},
	createFilter: function() {
		FilterManager.create(
			_("newfilt"),
			_("inserthere"),
			false,
			1,
			false
		);
	},
	_removeFilter: function() {
		this.filter.remove();
	},
	_restoreDefaultFilter: function() {
		if (Prompts.confirm(
			window,
			_('restorefilterstitle'),
			_('restorefilterstext'),
			_('restore'),
			Prompts.CANCEL,
			null,
			1) === 1) {
			return;
		}
		this.filter.restore();
	},
	restoreRemoveFilter: function() {
		if (this.filter.defFilter) {
			this._restoreDefaultFilter();
		} else {
			this._removeFilter();
		}
	},

	get rowCount() {
		return this._filters.length;
	},
	setTree: function(box) {
		this._box = box;
	},
	get box() {
		return this._box;
	},
	get current() {
		return this.selection.currentIndex;
	},
	set current(nv) {
		if (this.current !== nv) {
			this.selection.select(nv);
		}
	},
	getParentIndex: function(idx) {
		return -1;
	},
	getLevel: function(idx) {
		return 0;
	},
	get filter() {
		return this.getFilter(this.current);
	},
	getFilter: function(idx) {
		if (idx === -1 || idx >= this.rowCount) {
			throw new Components.Exception("Invalid index specified: " + idx);
		}
		return this._filters[idx];
	},
	getCellText: function(idx, col) {
		switch (col.index) {
			case 0:
				return this.getFilter(idx).label;
			case 1:
				return this.getFilter(idx).expression;
		}
		return null;
	},
	isSorted: function() {
		return false;
	},
	isContainer: function(idx) {
		return false;
	},
	isContainerOpen: function(idx) {
		return false;
	},
	isContainerEmpty: function(idx) {
		return false;
	},
	isSeparator: function(idx) {
		return false;
	},
	isEditable: function(idx) {
		return false;
	},
	getImageSrc: function(idx, col) {
		return null;
	},
	getProgressMode : function(idx,column) {

	},
	getCellValue: function(idx, column) {
		return false;
	},
	cycleHeader: function(col, elem) {},
	selectionChanged: function() {
		var idx = this.current;

		if (idx === -1) {
			$("filterLabel", "filterExpression", "filterText", "filterImage", "restoreremovebutton").forEach(
				function(a) { a.disabled = true; });
			$("filterLabel", "filterExpression").forEach(function(a) { a.value = ""; });
			$("filterText", "filterImage").forEach(function(a) { a.checked = false; });
			return;
		}

		var currentFilter = this._filters[idx];
		// invalid idx
		if (!currentFilter) {
			return;
		}

		$("filterLabel").value = currentFilter.label;
		$("filterExpression").value = currentFilter.expression;
		$("filterText").checked = currentFilter.type & LINK_FILTER;
		$("filterImage").checked = currentFilter.type & IMAGE_FILTER;
		$("filterLabel", "filterExpression", "filterText", "filterImage", "restoreremovebutton").forEach(
			function(a) { a.disabled = false; });

		$("restoreremovebutton").label = currentFilter.defFilter ?
			_('restorebutton') :
			_('removebutton');
	},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getRowProperties: function(idx) { return ""; },
	getCellProperties: function(idx, column) { return ""; },
	getColumnProperties: function(column, element) { return ""; },
	setCellValue: function(idx, col, value) {}
};

var Servers = {
	_limits: [],
	_editing: null,
	init: function() {
		this._list = $('serverLimits');
		try {
			this._load();
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to load Servers", ex);
		}

		// delay these assignments, or else we get messed up by the slider c'tor
		$('maxtasks').setAttribute('preference', 'dtamaxtasks');
		$('dtamaxtasks').updateElements();
		$('maxtasksperserver').setAttribute('preference', 'dtamaxtasksperserver');
		$('dtamaxtasksperserver').updateElements();

		this._list.addEventListener('LimitsEdit', evt => this.editLimit(evt), true);
		this._list.addEventListener('LimitsEditCancel', evt => this.cancelEditLimit(evt.originalTarget), true);
		this._list.addEventListener('LimitsEditSave', evt => this.saveEditLimit(evt), true);
		this._list.addEventListener('LimitsCanRemove', evt => this.canRemoveLimit(evt), true);
		this._list.addEventListener('LimitsRemoved', evt => this.removedLimit(evt.originalTarget), true);
	},
	editLimit: function(evt) {
		if (this._editing) {
			if (this._editing === evt.originalTarget) {
				return;
			}
			this.cancelEditLimit(this._editing);
		}
		this._editing = evt.originalTarget;
		this._editing.setAttribute('editing', 'true');
	},
	cancelEditLimit: function(target) {
		if (target !== this._editing) {
			return;
		}
		if (this._editing.limit.isNew) {
			this.removedLimit(target);
		}
		this._editing.removeAttribute('editing');
		this._editing = null;
	},
	saveEditLimit: function(evt) {
		if (evt.originalTarget !== this._editing) {
			return;
		}
		this._editing.removeAttribute('editing');
		this._editing = null;
		return true;
	},
	canRemoveLimit: function(evt) {
		if(Prompts.confirm(
			window,
			_('removelimittitle'),
			_('removelimitdesc', [evt.originalTarget.host]),
			_('removelimit'),
			Prompts.CANCEL,
			null,
			1
		) !== 0) {
			evt.preventDefault();
		}
	},
	removedLimit: function(target) {
		let ns = target.nextSibling || target.previousSibling;
		this._list.removeChild(target);
		if (ns) {
			this._list.selectedItem = ns;
			this._list.ensureElementIsVisible(ns);
		}
		$('noitemsbox').hidden = !!this._list.itemCount;
	},
	changedMaxTasks: function() {
		$('maxtaskslabel').value = $('maxtasks').value;
	},
	changedMaxTasksPerServer: function() {
		$('maxtasksperserverlabel').value = $('maxtasksperserver').value;
	},
	_load: function() {
		// clear the list
		while (this._list.firstChild){
			this._list.removeChild(this._list.firstChild);
		}
		for (let [,limit] in Iterator(this.listLimits())) {
			let e = document.createElement('richlistitem');
			e.setAttribute('class', 'serverlimit');
			e.setAttribute('id', "host" + limit.host);
			e.setAttribute('host', limit.host);
			e.setAttribute('searchlabel', limit.host);
			e.setAttribute('connections', limit.connections);
			e.setAttribute('speed', limit.speed);
			e.setAttribute('segments', limit.segments);
			e.limit = limit;
			this._list.appendChild(e);
		}
		$('noitemsbox').hidden = !!this._list.itemCount;
	},
	newInput: function() {
		$('newServerLimit').disabled = !$('spnewurl').value;
	},
	newLimit: function(url) {
		let newurl = $('spnewurl');
		url = url || newurl.value;
		try {
			let limit = this.addLimit(url);
			if (!limit.isNew) {
				this._list.selectedItem = $("host" + limit.host);
				this._list.selectedItem.edit();
				return;
			}
			let e = document.createElement('richlistitem');
			e.setAttribute('class', 'serverlimit');
			e.setAttribute('id', "host" + limit.host);
			e.setAttribute('host', limit.host);
			e.setAttribute('searchlabel', limit.host);
			e.setAttribute('connections', limit.connections);
			e.setAttribute('speed', limit.speed);
			e.limit = limit;
			this._list.appendChild(e);
			this._list.selectedItem = e;
			this._list.selectedItem.edit();
			newurl.value = '';
			this.newInput();
		}
		catch (ex) {
			log(LOG_ERROR, "failed to add limit", ex);
		}
		$('noitemsbox').hidden = !!this._list.itemCount;
	}
};
requireJoined(Servers, "support/serverlimits");

var Schedule = {
	init: function() {
		this.setupSchedDeck();
		$("schedenable").addEventListener("command", () => Schedule.setupSchedDeck(), false);
	},
	setupSchedDeck: function() {
		$("scheddeck").selectedIndex = $("schedenable").checked ? 1 : 0;
	},
	syncFromPref: function(element) {
		let pref = $(element.getAttribute("preference"));
		let val = pref.value;
		return Math.floor(val / 60) + ":" + (val % 60);
	},
	syncToPref: function(element) {
		return element.hour * 60 + element.minute;
	}
};

var Prefs = {
	load: function() {
		if (!("arguments" in window)) {
			return;
		}
		if (window.arguments.length === 2) {
			let cmd = window.arguments[1];
			if (!cmd) {
				return;
			}
			setTimeout(function() {
				switch (cmd.action) {
				case 'addlimits':
					Servers.newLimit(cmd.url);
					break;
				}
			}, 0);
		}
	},
	restoreAll: function() {
		if (Prompts.confirm(
			window,
			_('restoreprefstitle'),
			_('restoreprefstext'),
			_('restore'),
			Prompts.CANCEL,
			null,
			1) === 1) {
			return;
		}
		try {
			Preferences.resetAllExt();
		} catch(ex) {
			// XXX
		}
	}
};

unloadWindow(window, function() {
	log(LOG_DEBUG, "closed a pref window");
	close();
});
