/* global pref */
pref("extensions.dta.ctxmenu", "1,1,0");
pref("extensions.dta.ctxcompact", false);
pref("extensions.dta.toolsmenu", "0,0,0");
pref("extensions.dta.toolshidden", false);
pref("extensions.dta.closedta", false);
pref("extensions.dta.saveTemp", false);
pref("extensions.dta.downloadWin", true);
pref("extensions.dta.conflictresolution", 3);
pref("extensions.dta.ntask", 8);
pref("extensions.dta.timeout", 300);
pref("extensions.dta.maxchunks", 4);
pref("extensions.dta.history", 5);
pref("extensions.dta.alertbox", 2);
pref("extensions.dta.removecompleted", true);
pref("extensions.dta.removecanceled", false);
pref("extensions.dta.removeaborted", false);
pref("extensions.dta.infophrases", true);
pref("extensions.dta.statistics", false); // later use!
pref("extensions.dta.logging", false);
pref("extensions.dta.showonlyfilenames", true);
pref("extensions.dta.sounds.done", true);
pref("extensions.dta.sounds.error", false);
pref("extensions.dta.settime", true);
pref("extensions.dta.showtooltip", true);
pref("extensions.dta.renaming.default", JSON.stringify([
	"*name*.ext", "*num*_*name*.*ext", "*url*-*name*.*ext*",
	"*name* (*text*).*ext*", "*name* (*hh*-*mm*).*ext*"
	]));
pref("extensions.dta.filter.default", JSON.stringify([
	"", "/(.mp3)$/", "/(.(html|htm|rtf|doc|pdf))$/",
	"http://www.website.com/subdir/*.*",
	"http://www.website.com/subdir/pre*.???",
	"*.z??, *.css, *.html"
	]));
pref("extensions.dta.lastqueued", false);
pref("extensions.dta.lastalltabs", false);
pref("extensions.dta.rememberoneclick", false);
pref("extensions.dta.autoretryinterval", 300);
pref("extensions.dta.maxautoretries", 5);
pref("extensions.dta.autoclearcomplete", false);
pref("extensions.dta.confirmcancel", true);
pref("extensions.dta.confirmremove", true);
pref("extensions.dta.confirmremovecompleted", true);
pref("extensions.dta.permissions", 416);
pref("extensions.dta.loadendfirst", 0);
pref("extensions.dta.loadendfirst", 0);
pref("extensions.dta.startminimized", false);
pref("extensions.dta.flatreplacementchar", "-");
pref("extensions.dta.recoverallhttperrors", false);
pref("extensions.dta.selectbgimages", false);
pref("extensions.dta.nagnever", false);
pref("extensions.dta.nagnext", 500);
pref("extensions.dta.speedlimit", -1);
pref("extensions.dta.listsniffedvideos", false);
pref("extensions.dta.nokeepalive", true);
pref("extensions.dta.resumeonerror", false);
pref("extensions.dta.textlinks", true);
pref("extensions.dta.serverlimit.perserver", 4);
pref("extensions.dta.serverlimit.connectionscheduler", 'fast');
pref("extensions.dta.exposeInUA", false);
pref("extensions.dta.sparsefiles", false);
pref("extensions.dta.autosegments", true);
pref("extensions.dta.notification", true);
// Non-customizable-toolbar specific
pref("extensions.dta.tb.buttons", "1,1,0");

/**
 * Schedule
 */
pref("extensions.dta.schedule.enabled", false);
pref("extensions.dta.schedule.start", 0);
pref("extensions.dta.schedule.end", 1380); // 23:00
pref("extensions.dta.schedule.open", true);

/**
 * Privacy Controls
 */
pref("privacy.cpd.extensions-dta", false);
pref("privacy.clearOnShutdown.extensions-dta", false);

/**
 * Filters
 */
//See chrome/locale/filters.properties
pref("extensions.dta.filters.deffilter-all.label", "All files");
pref("extensions.dta.filters.deffilter-all.test", "/.*/i");
pref("extensions.dta.filters.deffilter-all.active", false);
pref("extensions.dta.filters.deffilter-all.type", 3);

pref("extensions.dta.filters.deffilter-arch.label", "Archives)");
pref("extensions.dta.filters.deffilter-arch.test",
	"/\\.(?:z(?:ip|[0-9]{2})|r(?:ar|[0-9]{2})|jar|bz2|gz|tar|rpm|7z(?:ip)?|lzma|xz)$/i");
pref("extensions.dta.filters.deffilter-arch.active", false);
pref("extensions.dta.filters.deffilter-arch.type", 1);
pref("extensions.dta.filters.deffilter-arch.icon", "zip");

pref("extensions.dta.filters.deffilter-vid.label", "Videos");
pref("extensions.dta.filters.deffilter-vid.test",
	"/\\.(?:mpeg|ra?m|avi|mp(?:g|e|4)|mov|divx|asf|qt|wmv|m\\dv|rv|vob|asx|ogm|ogv|webm)$/i");
pref("extensions.dta.filters.deffilter-vid.active", true);
pref("extensions.dta.filters.deffilter-vid.type", 3);
pref("extensions.dta.filters.deffilter-vid.icon", "avi");

pref("extensions.dta.filters.deffilter-aud.label", "Audio");
pref("extensions.dta.filters.deffilter-aud.test",
	"/\\.(?:mp3|wav|og(?:g|a)|flac|midi?|rm|aac|wma|mka|ape)$/i");
pref("extensions.dta.filters.deffilter-aud.active", true);
pref("extensions.dta.filters.deffilter-aud.type", 1);
pref("extensions.dta.filters.deffilter-aud.icon", "mp3");

pref("extensions.dta.filters.deffilter-img.label", "Images");
pref("extensions.dta.filters.deffilter-img.test",
	"/\\.(?:jp(?:e?g|e|2)|gif|png|tiff?|bmp|ico)$/i");
pref("extensions.dta.filters.deffilter-img.active", true);
pref("extensions.dta.filters.deffilter-img.type", 3);
pref("extensions.dta.filters.deffilter-img.icon", "jpg");

pref("extensions.dta.filters.deffilter-bin.label", "Software");
pref("extensions.dta.filters.deffilter-bin.test",
	"/\\.(?:exe|msi|dmg|bin|xpi|iso)$/i");
pref("extensions.dta.filters.deffilter-bin.active", false);
pref("extensions.dta.filters.deffilter-bin.type", 1);
pref("extensions.dta.filters.deffilter-bin.icon", "exe");

pref("extensions.dta.filters.deffilter-doc.label", "Documents");
pref("extensions.dta.filters.deffilter-doc.test",
	"/\\.(?:pdf|xlsx?|docx?|odf|odt|rtf)$/i");
pref("extensions.dta.filters.deffilter-doc.active", false);
pref("extensions.dta.filters.deffilter-doc.type", 1);
pref("extensions.dta.filters.deffilter-doc.icon", "doc");

pref("extensions.dta.filters.deffilter-imgjpg.label", "JPEG");
pref("extensions.dta.filters.deffilter-imgjpg.test", "/\\.jp(e?g|e|2)$/i");
pref("extensions.dta.filters.deffilter-imgjpg.active", false);
pref("extensions.dta.filters.deffilter-imgjpg.type", 3);
pref("extensions.dta.filters.deffilter-imgjpg.icon", "jpg");

pref("extensions.dta.filters.deffilter-imggif.label", "GIF");
pref("extensions.dta.filters.deffilter-imggif.test", "/\\.gif$/i");
pref("extensions.dta.filters.deffilter-imggif.active", false);
pref("extensions.dta.filters.deffilter-imggif.type", 2);
pref("extensions.dta.filters.deffilter-imggif.icon", "gif");

pref("extensions.dta.filters.deffilter-imgpng.label", "PNG");
pref("extensions.dta.filters.deffilter-imgpng.test", "/\\.png$/i");
pref("extensions.dta.filters.deffilter-imgpng.active", false);
pref("extensions.dta.filters.deffilter-imgpng.type", 2);
pref("extensions.dta.filters.deffilter-imgpng.icon", "png");


pref("extensions.mintrayr.downthemall.watchmanager", false);
