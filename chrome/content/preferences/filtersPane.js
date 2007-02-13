/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributers:
 *	Nils Maier <MaierMan@web.de>
 *
 * ***** END LICENSE BLOCK ***** */
 
var strbundle;

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
			
			// if the filters order has changed.. 
			// we gotta select the row that corrisponds to the filter that was selected
			if (index != -1 && oldfilters) {
				// this is the reference to our old selected filter, but in the new array of filters
				var selectedFilter = this._filters.filter(function(f){return f.id==oldfilters[index].id})[0];
				// let's select it
				this._table.view.selection.select(this._filters.indexOf(selectedFilter));
				Dialog.onTableSelectionChange();
			}
		} catch(e) {
			Debug.dump("reloadFilters():", e);
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

var Dialog = {
	
	// more on this later on :) see onTableSelectionChange()
	_lastRowEdited : -1,
	
	load: function DTA_load() {
		strbundle = $("strings");
		// create and attach the tree to the view
		this._table = $("filterTable");
		this._filterTree = new FilterTree(this._table);
		this._table.view = this._filterTree;
		// attach the listener to checkboxes
		$("filterText", "filterImage").forEach(function(a){a.addEventListener("CheckboxStateChange", Dialog.onCheckboxChange, false);});
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
			$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex", "removebutton").forEach(function(a){a.disabled=true});
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
		
		$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex", "removebutton").forEach(function(a){a.disabled=currentFilter.defFilter});
	},
	onIsRegexClick: function() {
		var test = $("filterTest").value;
		
		// not quite sure if this should be in there.
		// better would be testing DTA_regToRegExp/DTA_strToRegExp. Former will throw if it does not understand the regexp.
		// might want to check if the filter gets saved...
		if ($("filterIsRegex").checked) {
			if (test[0]!='/') {
				test='/'+test;
			}
			if (test[test.length-1]!='/') {
				test=test+'/';
			}
		} else {
			test = test.trim().replace(/^\/|\/$/gi, "");
		}
		$("filterTest").value = test;
		this.onFilterEdit();
	},
	onCheckboxChange : function() {
		Dialog.onFilterEdit();
		Dialog.onFinishedFilterEdit();
	},
	onFilterEdit: function() {
		var idx = this.getSelectedRow();
		var currentFilter = this.getFilter(idx);
		// invalid idx
		if (!currentFilter || currentFilter.defFilter) {
			return;
		}

		$("filterIsRegex").checked = $("filterTest").value.match(/^\/.+\/$/);

		if (
			$("filterLabel").value!=currentFilter.label 
			||
			$("filterTest").value!=currentFilter.test
			||
			currentFilter.type!= ($("filterText").checked?1:0) + ($("filterImage").checked?2:0)
			)
		{
			currentFilter.label = $("filterLabel").value;
			currentFilter.test = $("filterTest").value;
			currentFilter.isRegex = $("filterTest").value.match(/^\/.+\/$/);
			currentFilter.type = ($("filterText").checked?1:0) + ($("filterImage").checked?2:0);
			this._table.treeBoxObject.invalidateRow(idx);
			// if we want to save immediately:
			// currentFilter.save();
			// else
			this._lastRowEdited = idx;
		}
	},
	onFinishedFilterEdit : function() {
		if (this._lastRowEdited != -1) {
			// now we've finished editing, so let's save it
			// this is to avoid continuous calls to save() which is not a good thing...
			this.getFilter(this._lastRowEdited).save();
			this._lastRowEdited = -1;
		}
	},
	createFilter: function() {
		DTA_FilterManager.create(
			strbundle.getString("newfilt"), 
			strbundle.getString("inserthere"),
			false,
			1,
			false
		);
	},
	removeFilter: function() {
		var idx = this.getSelectedRow();
		var currentFilter = this.getFilter(idx);

		// invalid idx
		if (!currentFilter || currentFilter.defFilter) {
			return;
		}
		
		this._table.view.selection.clearSelection();
		var currentFilter = currentFilter.remove();
	},
	restoreDefaultFilters: function() {
		this._table.view.selection.clearSelection();
		var e = DTA_FilterManager.enumAll();
		while (e.hasMoreElements()) {
			var filter = e.getNext().QueryInterface(Components.interfaces.dtaIFilter);
			if (!filter.defFilter)
				filter.remove();
		}
	}
};