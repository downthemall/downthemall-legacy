#!/usr/bin/env python
import os
import sys
import re

from optparse import OptionParser
from warnings import warn
from io import BytesIO
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
from glob import glob
from fnmatch import fnmatch
from time import strftime
from xml.dom.minidom import parseString as XML
from functools import wraps

try:
    from xpisign.context import ZipFileMinorCompression as _Minor
    Minor = _Minor
except ImportError:
    warn("No optimal compression available")

    class Minor(object):
        """ Compatiblity stub"""

        def __init__(self, *args):
            pass

        def __enter__(self):
            pass

        def __exit__(self, *args):
            pass

try:
    from Mozilla.CompareLocales import compareDirs as _compare_locales
    compare_locales = _compare_locales
except ImportError:
    warn("CompareLocales is not available!")
    compare_locales = None


class Reset(object):
    """
    Reset the tracked file-like object stream position when done
    """

    def __init__(self, fp):
        self.fp = fp

    def __enter__(self):
        self.pos = self.fp.tell()

    def __exit__(self, *args):
        self.fp.seek(self.pos, 0)


class WorkingDirectory(object):
    """
    Change the working directory to make.py's path and restore when done
    """

    def __enter__(self):
        self.wd = os.getcwd()
        try:
            os.chdir(os.path.split(__file__)[0])
        except:
            pass

    def __exit__(self, *args):
        os.chdir(self.wd)

    @staticmethod
    def change(f):
        """
        Decorator: Change the working directory before calling wrapped
        function.
        """

        @wraps(f)
        def wrapper(*args, **kw):
            with WorkingDirectory():
                return f(*args, **kw)
        return wrapper


NS_RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
NS_EM = "http://www.mozilla.org/2004/em-rdf#"

RELEASE_ID = "{DDC359D1-844A-42a7-9AA1-88A850A938A8}"

FILES = ("install.rdf",
         "icon*.png",
         "bootstrap.js",
         "MPL", "GPL", "LGPL", "LICENSE",
         "chrome.manifest",
         "chrome/content/about/about.xul",
         "chrome/content/common/",
         "chrome/content/dta/",
         "chrome/content/integration/",
         "chrome/content/preferences/",
         "chrome/content/privacy/",
         "chrome/content/mac/",
         "chrome/content/unix/",
         "chrome/content/win/",
         "chrome/public/",
         "chrome/skin/",
         "chrome/locale/*/",
         "modules/*.js*",
         "modules/loaders/",
         "modules/manager/",
         "modules/support/",
         )
TESTS = ("modules/testsupport/",
         "tests"
         )
EXCLUDED = ("chrome/locale/*/landingpage.dtd",
            "chrome/locale/*/description.properties",
            )
PLAIN = ("*.png",
         "*.jpg",
         "*.gif"
         )


@WorkingDirectory.change
def check_locales():
    """
    Checks all chrome.manifest listed locales are complete and without errors.
    """

    if not compare_locales:
        return
    listed = dict()
    with open("chrome.manifest", "rb") as mp:
        r = re.compile(r"^locale\s+.+?\s+(.+?)\s+(.+?)\s*$")
        for l in mp:
            m = r.match(l)
            if not m:
                continue
            l, p = m.groups()
            listed[l] = p

    if not listed:
        raise ValueError("did not read any locales")

    if len(listed) == 1:
        return

    for x in ("en-US", "en", "de", "fr"):
        baseloc = listed.pop(x, None)
        if baseloc:
            break
    else:
        raise ValueError("failed to determine base locale")

    for l, p in listed.items():
        if not os.path.isdir(p):
            raise ValueError("Listed locale not available {}".format(l))

        res = compare_locales(baseloc, p)
        summary = res.getSummary()[None]
        if "errors" in summary or "missing" in summary:
            raise ValueError("{}: {}\n{}".format(l, summary, res.details))


def filesort(f):
    """
    Package file sort keys
    """

    if f in ("install.rdf",):
        return 0, f
    if f in ("bootstrap.js", "chrome.manifest"):
        return 1, f
    if fnmatch(f, "icon*.png"):
        return 2, f
    if fnmatch(f, "modules/*"):
        return 3, f
    if f in ("MPL", "GPL", "LGPL", "LICENSE"):
        return 1000, f
    return 500, f


def files(*args, **kw):
    """
    Generator over all file listing the given patterns.
    All arguments will be considered patterns.

    excluded keyword arg may specify a list of patterns that won't be returned
    """

    excluded = kw.pop("excluded", ())

    def items(f):
        if os.path.isdir(f):
            if not f.endswith("/"):
                f += "/"
            for i in files(f + "*"):
                yield i
        elif os.path.isfile(f) and not any(fnmatch(f, x) for x in excluded):
            yield f

    for p in args:
        gg = glob(p)
        if not gg:
            raise ValueError("{} did not match anything!".format(p))
        for g in gg:
            for i in items(g):
                yield i


def releaseversionjs(fp, **kw):
    """ Preprocess version.js in release mode """
    io = BytesIO()
    with Reset(io):
        for l in fp:
            if "const ID = " in l:
                print >>io, 'const ID = "{}"'.format(RELEASE_ID)
            else:
                print >>io, l,
    return io


def droptests(fp, **kw):
    """ Drop tests from chrome.manifest """
    io = BytesIO()
    with Reset(io):
        for l in fp:
            if "dta-tests" in l:
                continue
            print >>io, l,
    return io


def localize(fp, **kw):
    """ Generate em:localized """
    def sort(f):
        if "en-US" in f["locale"]:
            return 0, f["locale"]
        return 1, f["locale"]

    locales = list()
    for f in sorted(files("chrome/locale/*/description.properties")):
        locale = dict(locale=(f.split("/", 3)[2],))
        with open(f, "rb") as lp:
            for l in lp:
                l = l.strip()
                if not l or l.startswith("#"):
                    continue
                k, v = l.split("=", 1)
                k = k.split(".")
                k = k[-2] if len(k[-1]) < 3 else k[-1]
                if not k or not v:
                    continue
                if not k in locale:
                    locale[k] = list()
                locale[k] += v,
        locales += locale,

    io = BytesIO()
    with Reset(io):
        rdf = XML(fp.read())

        # kill old localized
        for e in rdf.getElementsByTagNameNS(NS_EM, "localized"):
            e.parentNode.removeChild(e)

        def mapkey(k):
            v = list()
            for e in rdf.getElementsByTagNameNS(NS_EM, k):
                v += e.firstChild.data,
            return k, v

        keys = ("locale", "name", "description", "creator", "homepageURL",
                "developer", "translator", "contributor")
        baseprops = dict(mapkey(k) for k in keys)

        node = rdf.createElementNS(NS_EM, "em:localized")
        desc = rdf.createElementNS(NS_RDF, "Description")
        for props in sorted(locales, key=sort):
            for k in keys:
                vals = props.get(k, baseprops.get(k, list()))
                for v in vals:
                    n = rdf.createElementNS(NS_EM, "em:" + k)
                    n.appendChild(rdf.createTextNode(v))
                    desc.appendChild(n)
        node.appendChild(desc)
        parent = rdf.getElementsByTagNameNS(NS_EM, "id")[0].parentNode
        parent.appendChild(rdf.createTextNode("\n\t\t"))
        parent.appendChild(node)
        parent.appendChild(rdf.createTextNode("\n\t"))

        print >>io, rdf.toxml(encoding="utf-8")
        rdf.unlink()
    return io


def localized(fn):
    """ Decorator: Wrap an install.rdf processor to also localize() """
    @wraps(fn)
    def wrapper(fp, **kw):
        fp = fn(fp, **kw)
        return localize(fp, **kw)
    return wrapper


def releasify(fp, **kw):
    with Reset(fp):
        rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, "id")[0].childNodes[0]
    node.data = RELEASE_ID

    io = BytesIO()
    with Reset(io):
        print >>io, rdf.toxml(encoding="utf-8")
    rdf.unlink()
    return io


def set_uurl(fp, **kw):
    """ Set the updateURL """

    with Reset(fp):
        rdf = XML(fp.read())

    node = rdf.getElementsByTagNameNS(NS_EM, 'aboutURL')[0]
    u = rdf.createElementNS(NS_EM, 'em:updateURL')
    u.appendChild(rdf.createTextNode(kw.get("updateurl")))
    node.parentNode.insertBefore(u, node)
    node.parentNode.insertBefore(rdf.createTextNode('\n\t\t'), node)

    io = BytesIO()
    with Reset(io):
        print >>io, rdf.toxml(encoding="utf-8")
    rdf.unlink()
    return io


@localized
def releaserdf(fp, **kw):
    """ Preprocesses install.rdf for release mode """

    with Reset(fp):
        rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, 'version')[0].childNodes[0]
    if not re.match(r"^[\d.]+$", node.data) or True:
        raise ValueError("Invalid release version: {}".format(node.data))

    return releasify(fp, *+kw)


@localized
def betardf(fp, **kw):
    """ Preprocess install.rdf for beta mode """

    with Reset(fp):
        rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, 'version')[0].firstChild
    if not re.match(r"^\d\.\db\d+$", node.data):
        raise ValueError("Invalid beta version: {}".format(node.data))

    return set_uurl(releasify(fp, **kw), **kw)


@localized
def nightlyrdf(fp, **kw):
    """ Preprocesses install.rdf for nightly mode """

    rdf = XML(fp.read())
    # update the version
    node = rdf.getElementsByTagNameNS(NS_EM, 'version')[0].childNodes[0]
    node.data += strftime(".%Y%m%d.%Hh%Mm%Ss")
    # a new name
    node = rdf.getElementsByTagNameNS(NS_EM, 'name')[0].childNodes[0]
    node.data += " *nightly*"

    io = BytesIO()
    with Reset(io):
        print >>io, rdf.toxml(encoding="utf-8")
    rdf.unlink()
    return set_uurl(io, **kw)


@localized
def devrdf(fp, **kw):
    """ Preprocesses install.rdf for default mode """

    rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, 'name')[0].childNodes[0]
    node.data += " *unofficial developer build*"

    io = BytesIO()
    with Reset(io):
        print >>io, rdf.toxml(encoding="utf-8")
    rdf.unlink()
    return io


@WorkingDirectory.change
def pack(xpi, patterns, **kw):
    """ Build the actual XPI """

    packing = sorted(set(files(*patterns, excluded=EXCLUDED)),
                     key=filesort)
    with ZipFile(xpi, "w", ZIP_DEFLATED) as zp:
        def write(fn, mode, modifier=None):
            with file(fn, "rb") as fp:
                if modifier:
                    with modifier(fp, **kw) as mp:
                        zp.writestr(fn, mp.read(), mode)
                else:
                    zp.writestr(fn, fp.read(), mode)

        with Minor(zp):
            for f in packing:
                if f == "modules/version.js" and \
                        kw.get("type", None) == "release":
                    write(f, ZIP_DEFLATED, releaseversionjs)
                elif f == "install.rdf":
                    t = kw.get("type", None)
                    if t == "release":
                        write(f, ZIP_DEFLATED, releaserdf)
                    elif t == "beta":
                        write(f, ZIP_DEFLATED, betardf)
                    elif t == "nightly":
                        write(f, ZIP_DEFLATED, nightlyrdf)
                    else:
                        write(f, ZIP_DEFLATED, devrdf)
                elif not kw.get("tests", False) and f == "chrome.manifest":
                    write(f, ZIP_DEFLATED, droptests)
                elif any(fnmatch(f, p) for p in PLAIN):
                    write(f, ZIP_STORED)
                else:
                    write(f, ZIP_DEFLATED)


def create(args):
    """ Process arguments and create the XPI """

    parser = OptionParser()
    parser.add_option("--force",
                      dest="force",
                      help="force overwrite output file if exists",
                      action="store_true",
                      default=False
                      )
    parser.add_option("--release",
                      dest="type",
                      help="create release XPI",
                      action="store_const",
                      const="release"
                      )
    parser.add_option("--beta",
                      dest="type",
                      help="create release XPI",
                      action="store_const",
                      const="beta"
                      )
    parser.add_option("--nightly",
                      dest="type",
                      help="create nightly XPI",
                      action="store_const",
                      const="nightly"
                      )
    parser.add_option("--updateURL",
                      dest="updateurl",
                      help="nightly update url",
                      type="string",
                      default=None
                      )
    parser.add_option("--tests",
                      dest="tests",
                      help="ships tests as well",
                      action="store_true",
                      default=False
                      )
    opts, args = parser.parse_args(args)

    patterns = FILES
    if opts.tests:
        patterns += TESTS

    if len(args) != 1:
        raise ValueError("No distinct XPI name provided")
    output = args[0]

    if opts.type in ("nightly", "beta") and not opts.updateurl:
        raise ValueError("Nightly/Beta requested but no update URL provided")
    elif opts.type == "release" and opts.updateurl:
        raise ValueError("Release versions cannot have an update URL")
    if not opts.force and os.path.exists(output):
        raise ValueError("Output file already exists")

    check_locales()

    with BytesIO() as io:
        try:
            with Reset(io):
                pack(io, patterns, **opts.__dict__)
        except Exception as ex:
            raise Exception("Failed packing: {}".format(ex)), None, \
                sys.exc_info()[2]

        try:
            with open(output, "wb") as op:
                op.write(io.read())
        except Exception as ex:
            raise Exception("Failed writing XPI: {}".format(ex)), None, \
                sys.exc_info()[2]


if __name__ == "__main__":
    create(sys.argv[1:])
