/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll!
 *
 * The Initial Developers of the Original Code are Stefano Verna and Federico Parodi
 * Portions created by the Initial Developers are Copyright (C) 2004-2007
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna
 *    Federico Parodi <jimmy2k@gmail.com>
 *    Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var LINK_FILTER = Ci.dtaIFilter.LINK_FILTER;
var IMAGE_FILTER = Ci.dtaIFilter.IMAGE_FILTER;

var Prompts = {};
Components.utils.import('resource://dta/prompts.jsm', Prompts);

var Main = {
	load: function() {
		$('alert2').hidden = !('nsIAlertsService' in Ci);
	}
}

var Privacy = {
	load: function PP_load() {
		try {
			var log = !DTA.getProfileFile('dta_log.txt').exists();
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e) { e.disabled = log; });
			
			$("butFiltDel").disabled = !DTA.getDropDownValue("filter");
			$("butFoldDel").disabled = !DTA.getDropDownValue("directory");
		}
		catch(ex) {
			Debug.log("privacyLoad(): ", ex);
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
		if (Debug.file.exists()) {
			openUrl("file://" + Debug.file.path);
		}
	},
	revealLog: function() {
		if (Debug.file.exists()) {
			Utils.reveal(Debug.file);
		}
	},
	deleteLog: function() {
		try {
			Debug.remove();
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e){ e.disabled = true; });
		}
		catch (ex) {
			alert(ex);
		}
	},
	showNotice: function() {
		DTA.Mediator.showNotice(window);
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
		var f = Utils.askForDir(Preferences.getExt("tempLocation", tmp.value), "");
		if (!f) {
			return;
		}
		$("temp").value = f;
		Preferences.setExt("tempLocation", f);
		$("temp").focus();
	},
	toggleTemp: function() {
		$("temp").disabled = $("browsedir").disabled = !$("useTemp").checked;
	},
	getPerm: function(perm) {
		return $('dtapermissions').value & perm;
	},
	setPerm: function(perm) {
		var rv = $('dtapermissions').value ^ perm;
		return $('dtapermissions').value ^ perm;
	},
	changedMaxChunks: function() {
		let v = $('maxchunks').value;
		$('maxchunkslabel').value = $('maxchunks').value;
		if (v == '1') {
			$('maxchunkslabel').value += ' / ' + _('disabled');
		}
	},
	changedLoadEndFirst: function() {
		let v = $('loadendfirst').value;
		if (v == '0') {
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
		return which in menu ? menu[which] == '1' : false;
	},
	setMenu: function(pref, which) {
		let menu = $(pref).value.split(',');
		menu[which] = $(pref + which).checked ? 1 : 0;
		return menu.toString();
	},
	openMinTrayR: function() {
		openUrl('https://tn123.org/mintrayr/?fromdta');
	}
};

var Filters = {
	_filters: [],
	_lastRowEdited : -1,
	
	Observer: {
		registerObserver: function() {
			try {
				Preferences.makeObserver(this);
				var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
				os.addObserver(this, 'DTA:filterschanged', true);
			}
			catch (ex) {
				Debug.log("cannot install filterManager observer!", ex);
				return false;
			}
			return true;
		},	
		// nsIObserver::observe
		observe : function(subject, topic, prefName) {
			// filterManager will throw this topic at us.
			if (topic == 'DTA:filterschanged') {
				// the heavy work will be performed by changeTab..
				// it will create the filter boxen for us, and furthermore do another selection
				Filters.reloadFilters();
			}
		}
	},

	load: function() {
		if (Components.interfacesByID["{C06DC4D3-63A2-4422-A0A3-5F2EDDECA8C1}"]) { 
			this.getCellProperties = this.getCellProperties_legacy; 
			this.getColumnProperties = this.getColumnProperties_legacy; 
			this.getRowProperties = this.getRowProperties_legacy; 
		} 

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

			for (let filter in new Utils.SimpleIterator(DTA.FilterManager.enumAll(), Ci.dtaIFilter)) {
				this._filters.push(filter);
			}
			this._box.rowCountChanged(0, this.rowCount);
			
			// if we added a new filter
			if (old.length < this._filters.length) {
				this._filters.some(
					function(f, i) {
						var idx = old.indexOf(f.id);
						if (idx == -1) {
							this.selection.select(i);
							this._box.ensureRowIsVisible(i);
							return true;
						}
						return false;
					},
					this
				);
			}
			else if (old.length == this._filters.length && index != -1) {
				this.selection.select(index);
				this._box.scrollToRow(index);
			}
			else if (this._filters.length){
				this.selection.select(0);
			}
		}
		catch(ex) {
			Debug.log("reloadFilters():", ex);
		}
	},
	onCheckboxChange : function() {
		this.onFilterEdit();
		this.onFinishedFilterEdit();
	},
	onFilterEdit: function() {
		let filter = this.filter;
		let newType = ($("filterText").checked ? LINK_FILTER : 0) | ($("filterImage").checked ? IMAGE_FILTER : 0);
		
		if (
			$("filterLabel").value != filter.label 
			|| $("filterExpression").value != filter.expression
			|| filter.type != newType
		)
		{
			filter.label = $("filterLabel").value;
			filter.type = newType;
			filter.expression = $("filterExpression").value;
			
			var idx = this.selection.currentIndex;
			this.box.invalidateRow(idx);
			this._lastRowEdited = idx;
		}
	},
	onFinishedFilterEdit : function() {
		if (this._lastRowEdited != -1) {
			this.getFilter(this._lastRowEdited).save();
			this._lastRowEdited = -1;
		}
	},
	createFilter: function() {
		DTA.FilterManager.create(
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
		if (Prompts.confirm(window, _('restorefilterstitle'), _('restorefilterstext'), _('restore'), Prompts.CANCEL, null, 1) == 1) {
			return;
		}
		this.filter.restore();
	},
	restoreRemoveFilter: function() {
		if (this.filter.defFilter) {
			this._restoreDefaultFilter()
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
		if (this.current != nv) {
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
		if (idx==-1 || idx >= this.rowCount) {
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

		if (idx == -1) {
			$("filterLabel", "filterExpression", "filterText", "filterImage", "restoreremovebutton").forEach(
				function(a){
					a.disabled = true
				}
			);
			$("filterLabel", "filterExpression").forEach(
				function(a){
					a.value = ""
				}
			);
			$("filterText", "filterImage").forEach(
				function(a){
					a.checked = false
				}
			);
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
			function(a){
				a.disabled = false
			}
		);
		
		$("restoreremovebutton").label = currentFilter.defFilter
			? _('restorebutton')
			: _('removebutton');
	},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getRowProperties_legacy: function(idx, prop) {},
	getRowProperties: function(idx) "",
	getCellProperties_legacy: function(idx, column, prop) {},
	getCellProperties: function(idx, column) "",
	getColumnProperties_legacy: function(column, element, prop) {},
	getColumnProperties: function(column, element) "",
	setCellValue: function(idx, col, value) {}
};

var Servers = {
	_limits: [],
	_editing: null,
	init: function() {
		this._list = $('serverLimits');
		try {
			this._load();
		} catch (ex) {
			Debug.log("Failed to load Servers", ex);
		}
		
		// delay these assignments, or else we get messed up by the slider c'tor
		$('maxtasks').setAttribute('preference', 'dtamaxtasks');
		$('dtamaxtasks').updateElements();		
		$('maxtasksperserver').setAttribute('preference', 'dtamaxtasksperserver');
		$('dtamaxtasksperserver').updateElements();
		
		let _tp = this;
		this._list.addEventListener('LimitsEdit', function(evt) _tp.editLimit(evt), true);
		this._list.addEventListener('LimitsEditCancel', function(evt) _tp.cancelEditLimit(evt.originalTarget), true);
		this._list.addEventListener('LimitsEditSave', function(evt) _tp.saveEditLimit(evt), true);
		this._list.addEventListener('LimitsCanRemove', function(evt) _tp.canRemoveLimit(evt), true);
		this._list.addEventListener('LimitsRemoved', function(evt) _tp.removedLimit(evt.originalTarget), true);
	},
	editLimit: function(evt) {
		if (this._editing) {
			if (this._editing == evt.originalTarget) {
				return;
			}
			this.cancelEditLimit(this._editing);
		}
		this._editing = evt.originalTarget;
		this._editing.setAttribute('editing', 'true');
	},
	cancelEditLimit: function(target) {
		if (target != this._editing) {
			return;
		}
		if (this._editing.limit.isNew) {
			this.removedLimit(target);
		}
		this._editing.removeAttribute('editing');
		this._editing = null;
	},
	saveEditLimit: function(evt) {
		if (evt.originalTarget != this._editing) {
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
		) != 0) {
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
		for each (let limit in this.listLimits()) {
			let e = document.createElement('richlistitem');
			e.setAttribute('class', 'serverlimit');
			e.setAttribute('id', "host" + limit.host);
			e.setAttribute('host', limit.host);
			e.setAttribute('searchlabel', limit.host);			
			e.setAttribute('connections', limit.connections);
			e.setAttribute('speed', limit.speed);
			e.limit = limit;
			this._list.appendChild(e);
		}
		$('noitemsbox').hidden = !!this._list.itemCount;
	},
	newInput: function() {
		$('newServerLimit').disabled = !$('spnewurl').value;
	},
	newLimit: function() {
		let newurl = $('spnewurl');
		try {
			let limit = this.addLimit(newurl.value);
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
			Debug.log("failed to add limit", ex);
		}
		$('noitemsbox').hidden = !!this._list.itemCount;		
	}
};
Components.utils.import('resource://dta/support/serverlimits.jsm', Servers);
ServiceGetter(Servers, 'prompts', '@mozilla.org/embedcomp/prompt-service;1', 'nsIPromptService');

var Prefs = {
	load: function() {
		Components.utils.import('resource://dta/version.jsm');

		if (Version.APP_ID == "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}" && !Preferences.hasUserValue("general.skins.selectedSkin")) {
			document.documentElement.setAttribute("firefoxtheme", true);
		}
	},
	restoreAll: function() {
		if (Prompts.confirm(window, _('restoreprefstitle'), _('restoreprefstext'), _('restore'), Prompts.CANCEL, null, 1) == 1) {
			return;
		}
		try {
			Preferences.resetAllExt();
		} catch(ex) {
			// XXX
		}
	}
}
