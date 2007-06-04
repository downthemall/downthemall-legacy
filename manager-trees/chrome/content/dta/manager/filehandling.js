var FileHandling = {
	openFolder: function() {
		for (d in Tree.selected) {
			try {
				if (d.is(COMPLETE)) {
					OpenExternal.reveal(d.destinationFile);
				} else {
					OpenExternal.reveal(d.destinationPath);
				}
			} catch (ex) {
				Debug.dump('reveal', ex);
			}
		}
	},
	openFile: function() {
		var cur = Tree.current;
		if (cur && cur.is(COMPLETE)) {
			try {
				OpenExternal.launch(cur.destinationFile);
			}
			catch (ex) {
				Debug.dump('launch', ex);
			}
		}
	},
	deleteFile: function() {
		var list = [];
		
		for (d in Tree.selected) {
			if (d.is(COMPLETE)) {
				var file = new FileFactory(d.destinationFile);
				if (file.exists()) {
					list.push(d);
				}
			}
		}
		if (!list.length) {
			return;
		}
		var msg = '';
		if (list.length < 25) {
			msg = _('deletetexts');
			list.forEach(
				function(d) {
					msg += "\n" + (new FileFactory(d.destinationFile)).leafName;
				}
			);				
		}
		else {
			msg = _('deletetextl', [list.length]);
		}
		if (!DTA_confirm(_('deletetitle'), msg, _('delete'), DTA_confirm.CANCEL, null, 1)) {
			list.forEach(
				function(d) {
					try {
						var file = new FileFactory(d.destinationFile);
						if (file.exists()) {
							file.remove(false);
						}
					}
					catch (ex) {
						// no-op
					}
				}
			);
			Tree.remove(list);
			Tree.selection.clearSelection();
		}
	}
};