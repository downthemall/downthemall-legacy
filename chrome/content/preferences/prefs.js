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
 *    Federico Parodi
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

if (!Cc) {
	const Cc = Components.classes;
}
if (!Ci) {
	const Ci = Components.interfaces;
}

var Main = {
	load: function() {
		$('alert2').hidden = !('nsIAlertsService' in Ci);
	}
}

var Privacy = {
	load: function PP_load() {
		try {
			var log = !DTA_profileFile.get('dta_log.txt').exists();
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e) { e.disabled = log; });
			
			var history = uneval(Preferences.getDTA("filter", ''));
			history = !history || !history.length;
			$("butFiltDel").disabled = history;
				
			history = uneval(Preferences.getDTA("directory", ''));
			history = !history || !history.length;
			$("butFoldDel").disabled = history;
		}
		catch(ex) {
			Debug.dump("privacyLoad(): ", ex);
		}
	},
	delFilters: function() {
		Preferences.resetDTA("filter");
	},
	delDirectories: function() {
		Preferences.resetDTA("directory");
	},
	showLog: function() {
		var log = DTA_profileFile.get('dta_log.txt');
		if (log.exists()) {
			DTA_Mediator.openTab("file://" + log.path);
		}
	},
	revealLog: function() {
		var log = DTA_profileFile.get('dta_log.txt')
			.QueryInterface(Ci.nsILocalFile);
		if (log.exists()) {
			OpenExternal.reveal(log);
		}
	},
	deleteLog: function() {
		var log = DTA_profileFile.get('dta_log.txt');
		if (log.exists()) {
			log.remove(false);
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e){ e.disabled = true; });
		}
	}
};

var Advanced = {
	browse: function() {
		// let's check and create the directory
		var tmp = $("temp");
		if (!tmp) {
			return;
		}
		var f = Utils.askForDir(Preferences.getMultiByteDTA("tempLocation", tmp.value), "");
		if (!f) {
			return;
		}
		$("temp").value = f;
		Preferences.setMultiByteDTA("tempLocation", f);
		$("temp").focus();
	},
	toggleTemp: function() {
		$("temp").disabled = $("browsedir").disabled = !$("useTemp").checked;
	}
};

var Interface = {
	getMenu: function(pref, which) {
		return $(pref).value.split(',')[which] == '1';
	},
	setMenu: function(pref, which) {
		var menu = $(pref).value.split(',');
		menu[which] = $(pref + which).checked ? 1 : 0;
		return menu.toString();
	}
};

function FilterTree(table) {
	this._table = table;
	this.reloadFilters();
	this.registerObserver();
}

FilterTree.prototype = {
	reloadFilters: function() {
		
		// something has changed..
		try {
			// i'm saving the old filters positions and the selected row for a later use
			var oldfilters = this._filters;
			var index = this._table.view.selection.currentIndex;

			// let's get the new filters
			this._filters = [];
			var e = DTA_FilterManager.enumAll();
			while (e.hasMoreElements()) {
				var filter = e.getNext().QueryInterface(Components.interfaces.dtaIFilter);
				this._filters.push(filter);
			}
			
			// the whole table is completely different
			if (oldfilters) {
				this._table.treeBoxObject.rowCountChanged(0, -oldfilters.length);
			}
			this._table.treeBoxObject.rowCountChanged(0, this._filters.length);

			if (!oldfilters) {
				return;
			}
			
			// if we added a new filter
			if (oldfilters.length < this._filters.length) {
				// we find the new filters
				var addedFilters = this._filters.filter(
					function(f){
						return !oldfilters.some(
							function(f1) {
								return f1.id == f.id
							}
						)
					}	
				);
				// and we select the first one
				this.selectFilter(addedFilters[0]);
			} else if (oldfilters.length == this._filters.length && index!=-1) {
				// else we select the old filter
				this.selectFilter(oldfilters[index]);
			}
		} catch(e) {
			Debug.dump("reloadFilters():", e);
		}
	},
	selectFilter : function(filter) {
		// this is the reference to our filter
		var selectedFilter = this._filters.filter(function(f){return f.id==filter.id});	
		// if that old selected filter still exists..
		if (selectedFilter.length==1) {
			// let's select it
			this._table.view.selection.select(this._filters.indexOf(selectedFilter[0]));
		}
	},
	get rowCount() {
		return this._filters.length;
	},
	setTree: function(box) {
		this._box = box;
	},
	getParentIndex: function(idx) {
		return -1;
	},
	getLevel: function(idx) {
		return 0;
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
				return this.getFilter(idx).test;
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
	selectionChanged: function() {},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getRowProperties: function(idx, prop) {
		return;
	},
	getCellProperties: function(idx, column, prop) {
		return;
	},
	getColumnProperties: function(column, element, prop) {},
	setCellValue: function(idx, col, value) {
		return;
	},
	
	// ** observer ** //
	QueryInterface: function(iid) {
		if (
			iid.equals(Ci.nsISupports)
			|| iid.equals(Ci.nsISupportsWeakReference)
			|| iid.equals(Ci.nsIWeakReference)
			|| iid.equals(Ci.nsiObserver)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	// nsiWeakReference::QueryReferent
	// for weak observer
	QueryReferent: function(iid) {
		return this;
	},
	// nsiSupportsWeakReference
	// for weak observer
	GetWeakReference: function() {
		return this;
	},
	// nsIObserver::observe
	observe : function(subject, topic, prefName) {
		// filterManager will throw this topic at us.
		if (topic == 'DTA:filterschanged') {
			// the heavy work will be performed by changeTab..
			// it will create the filter boxen for us, and furthermore do another selection
			this.reloadFilters();
		}
	},
	// register ourselves
	// * filterManager
	registerObserver: function() {
		try {
			var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
			os.addObserver(this, 'DTA:filterschanged', true);
		} catch (ex) {
			Debug.dump("cannot install filterManager observer!", ex);
			return false;
		}
		return true;
	}
};

var Filters = {
	
	// more on this later on :) see onTableSelectionChange()
	_lastRowEdited : -1,
	
	load: function DTA_load() {
		// create and attach the tree to the view
		this._table = $("filterTable");
		this._filterTree = new FilterTree(this._table);
		this._table.view = this._filterTree;
		if (this._filterTree.rowCount >= 1)
			this._table.view.selection.select(0);
	},
	getSelectedRow: function() {
		return this._table.view.selection.currentIndex;
	},
	getFilter: function(idx) {
		try {
			return this._filterTree.getFilter(idx);
		} catch(e) {}
		return null;
	},
	onTableSelectionChange: function() {
		var idx = this.getSelectedRow();
		
		if (idx==-1) {
			$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex", "restoreremovebutton").forEach(function(a){a.disabled=true});
			$("filterLabel", "filterTest").forEach(function(a){a.value=""});
			$("filterText", "filterImage", "filterIsRegex").forEach(function(a){a.checked=false});
			return;
		}
		
		var currentFilter = this.getFilter(idx);
		// invalid idx
		if (!currentFilter) {
			return;
		}

		$("filterLabel").value = currentFilter.label;
		$("filterTest").value = currentFilter.test;
		$("filterIsRegex").checked = currentFilter.isRegex;
		$("filterText").checked = currentFilter.type & 1;
		$("filterImage").checked = currentFilter.type & 2;
		$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex", "restoreremovebutton").forEach(function(a){a.disabled=false});
		
		$("restoreremovebutton").label = currentFilter.defFilter?_('restorebutton'):_('removebutton');
		this.doCheckboxValidation();
	},
	doCheckboxValidation : function() {
		
		var idx = this.getSelectedRow();
		var currentFilter = this.getFilter(idx);
		// invalid idx
		if (!currentFilter) {
			return;
		}
		
		var potentiallyValidRegExp = false;
		try {
			var potentialReg = this.addSlashes($("filterTest").value);
			potentiallyValidRegExp	= DTA_regToRegExp(potentialReg);
		} catch(e) {}
		
		if (!potentiallyValidRegExp) {
			$("filterIsRegex").disabled = true;
		} else {
			$("filterIsRegex").disabled = false;
		}
		
		if (this.isValidFilter()) {
			$("filterIsRegex").checked = $("filterTest").value.match(/^\/.+\/i?$/);
		} else {
			var lastCaretPosition = $("filterTest").selectionStart;
			$("filterTest").value = $("filterTest").value.trim().replace(/^\/|\/i?$/gi, "");
			$("filterTest").setSelectionRange(lastCaretPosition-1, lastCaretPosition-1);
			$("filterIsRegex").checked = false;
		}
	},
	addSlashes: function(test) {
		if (test[0]!='/') {
			test='/'+test;
		}
		if (!test.match(/\/i?$/)) {
			test=test+'/i';
		}
		return test;
	},
	onIsRegexClick: function() {
		
		var test = $("filterTest").value;
		
		if ($("filterIsRegex").checked) {
			test = this.addSlashes(test);
		} else {
			test = test.trim().replace(/^\/|\/i?$/gi, "");
		}
		
		$("filterTest").value = test;
		
		this.onFilterEdit();
		this.onFinishedFilterEdit();
	},
	onCheckboxChange : function() {
		
		this.onFilterEdit();
		this.onFinishedFilterEdit();
	},
	isValidFilter : function() {
		
		var filter = $("filterTest").value;
		try {
			if ($("filterIsRegex").checked) {
				return DTA_regToRegExp(filter);
			} else {
				return DTA_strToRegExp(filter);
			}
		} catch(ex) {}
		return null;
	},
	onFilterEdit: function() {
		
		var idx = this.getSelectedRow();
		var currentFilter = this.getFilter(idx);
		// invalid idx
		if (!currentFilter) {
			return;
		}
		
		this.doCheckboxValidation();
		
		if (
			$("filterLabel").value!=currentFilter.label 
			||
			$("filterTest").value!=currentFilter.test
			||
			currentFilter.type!= ($("filterText").checked?1:0) + ($("filterImage").checked?2:0)
			||
			currentFilter.isRegex != $("filterIsRegex").checked
			)
		{
			currentFilter.label = $("filterLabel").value;
			currentFilter.isRegex = $("filterIsRegex").checked;
			currentFilter.type = ($("filterText").checked?1:0) + ($("filterImage").checked?2:0);
			currentFilter.test = $("filterTest").value;
			
			this._table.treeBoxObject.invalidateRow(idx);
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
		
		var id = DTA_FilterManager.create(
			_("newfilt"), 
			_("inserthere"),
			false,
			1,
			false
		);
	},
	removeFilter: function() {
		var currentFilter = this.getFilter(this.getSelectedRow());
		this._table.view.selection.select(-1);
		var currentFilter = currentFilter.remove();
	},
	restoreDefaultFilter: function() {
		if (DTA_confirm(_('restorefilterstitle'), _('restorefilterstext'), _('restore'), DTA_confirm.CANCEL, null, 1) == 1) {
			return;
		}
		var currentFilter = this.getFilter(this.getSelectedRow());
		currentFilter.restore();
	},
	restoreRemoveFilter: function() {
		var idx = this.getSelectedRow();
		if (idx==-1){
			return;
		}
		var currentFilter = this.getFilter(idx);
		if (currentFilter.defFilter) {
			this.restoreDefaultFilter()
		} else {
			this.removeFilter();
		}
	}
};


var Prefs = {
	load: function() {
	},
	restoreAll: function() {
		if (DTA_confirm(_('restoreprefstitle'), _('restoreprefstext'), _('restore'), DTA_confirm.CANCEL, null, 1) == 1) {
			return;
		}
		try {
			Preferences.resetAll();
		} catch(ex) {
			// XXX
		}
	}
}