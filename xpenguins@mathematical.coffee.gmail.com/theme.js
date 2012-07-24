/*********************
 * Contains Theme class.
 * xpenguins_theme.c
 *********************/
/* Imports */
const Lang  = imports.lang;
const Shell = imports.gi.Shell;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
const ThemeManager = Me.themeManager;
const Toon   = Me.toon;
const WindowListener = Me.windowListener;
const XPenguins = Me.xpenguins;
const XPUtil = Me.util;

const Gettext = imports.gettext.domain('xpenguins');
const _ = Gettext.gettext;

/***********************
 *    Theme Object     *
 ***********************/
/* Contains all the information about the toon,
 * basically an array of ToonData structures.
 */
function Theme() {
    this._init.apply(this, arguments);
}

Theme.prototype = {
    _init: function (themeList) {
        XPUtil.LOG('creating theme');
        /* members */
        /* Theme: can have one or more genera
         * Genus: class of toons (Penguins has 2: walker & skateboarder).
         * Each genus has toon types: walker, floater, tumbler, faller, ...
         */
        /* per genus in each theme */
        this.toonData = {}; // [genus][type], where genus == <Theme_Genus||1>.
        this.nactions = {};
        this.number   = {}; // default number of toons for that genus
        /* per theme */
        this._themeGenusMap = {}; // theme => [genus1, genus2]
        this.totalsPerTheme = {}; // default number of toons for that theme.

        /* global across all themes/genii */
        this.delay = 60;
        this.total = 0;

        /* Initialise */
        themeList = themeList || [];
        for (let i = 0; i < themeList.length; ++i) {
            XPUtil.DEBUG(' ... appending theme %s', themeList[i]);
            this.appendTheme(themeList[i]);
        }
    }, // _init

    hasTheme: function (iname) {
        return this._themeGenusMap[ThemeManager.sanitiseThemeName(iname)] !== undefined;
    },

    /* get genus names for a theme as an array */
    getGeniiForTheme: function (iname) {
        return this._themeGenusMap[ThemeManager.sanitiseThemeName(iname)] || [];
    },

    /* gets numbers per genus for a theme as an array. */
    getGenusNumbersForTheme: function (iname) {
        let name = ThemeManager.sanitiseThemeName(iname);
        if (!this._themeGenusMap[name]) {
            return [];
        }
        return this._themeGenusMap[name].map(Lang.bind(this, function (genus) {
            return this.number[genus];
        }));
    },

    /* get number of toons for that theme */
    getTotalForTheme: function (iname) {
        let name = ThemeManager.sanitiseThemeName(iname);
        return this.totalsPerTheme[name] || 0;
    },

    removeTheme: function (iname) {
        /* Note: we do not actually delete this.toonData[genus_names] etc
         * because we want on-the-fly theme swapping, meaning toons that
         * are in the "dead" genus should explode using their old genus data
         * and then respawn with the new genus data.
         * They'll need to have this.toonData[genus_name] for that.
         */
        let name = ThemeManager.sanitiseThemeName(iname);
        if (!this._themeGenusMap[name]) {
            return;
        }
        this.total -= this.totalsPerTheme[name];
    },

    /* Append the theme named "name" to this theme. */
    appendTheme: function (iname) {
        /* find theme */
        let name = ThemeManager.sanitiseThemeName(iname),
            file_name = ThemeManager.getThemePath(name);
        if (!file_name) {
            throw new Error("Theme " + name + " not found or config file not present");
        }
        /* if theme has already been parsed, do not re-parse */
        if (this._themeGenusMap[name]) {
            XPUtil.warn("Warning: theme %s already exists, not re-parsing",
                iname);
            return;
        }


        /* Read config file, ignoring comments ('#') and whitespace */
        let words = Shell.get_file_contents_utf8_sync(file_name),
            added_genii = [],
            genus = name + '_1',
            current,    // holds the current ToonData
            def = {},   // holds default ToonData
            dummy = {}, // any unknown ToonData
            gdata,      // various looping variables
            itype,
            igenus;

        /* iterate through the words to parse the config file. */
        words = words.replace(/#.+/g, '');
        words = words.replace(/\s+/g, ' ');
        /* Note: the 'toon' word is optional in one-genus themes.
         * If the 'toon' word is present there must be a genus name
         * so no need to use the default '_1'.
         */
        if (!words.match(/\btoon\b/)) {
            this.grow(genus, name);
            added_genii.push(genus);
        }
        words = words.trim().split(' ');


        /* make space for the next toon */
        try {
            for (let i = 0; i < words.length; ++i) {
                let word = words[i].toLowerCase();
                if (word === 'toon') {
                    /* store the genus index with the theme name */
                    genus = name + '_' + words[++i];
                    this.grow(genus, name); // will abort if alredy exists
                    added_genii.push(genus);
                } else if (word === 'delay') {
                /* preferred frame delay in milliseconds */
                    this.delay = parseInt(words[++i], 10);
                } else if (word === 'define') {
                /* Various types of toon */
                    let type = words[++i];
                    /* Define default properties of current genus */
                    if (type === 'default') {
                        current = def;
                    } else if (type.match(/^(walker|faller|tumbler|floater|climber|runner|action[0-5]|exit|explosion|splatted|squashed|zapped|angel)$/)) {
                    /* other types of toon */
                        /* note: passed by reference. */
                        this.toonData[genus][type] = new Toon.ToonData(def);
                        current = this.toonData[genus][type];
                        if (type.substr(0, 6) === 'action') {
                            this.nactions[genus]++;
                        }
                    } else {
                        XPUtil.warn(_("Warning: unknown type '%s': ignoring"),
                            type);
                        current = dummy;
                    }
                    /* extra configuration */
                    if (type === 'exit') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE);
                    } else if (type === 'explosion') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                    } else if (type === 'splatted') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE);
                    } else if (type === 'squashed') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                    } else if (type === 'zapped') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                    } else if (type === 'angel') {
                        current.conf |= (Toon.INVULNERABLE | Toon.NOBLOCK);
                    }
                /* Toon Properties */
                } else if (word.match(/^(width|height|speed|acceleration|terminal_velocity|loop)$/)) {
                    current[word] = parseInt(words[++i], 10);
                } else if (word.match(/^(frames|directions)/)) {
                    current['n' + word] = parseInt(words[++i], 10);
                } else if (word === 'pixmap') {
                /* Pixmap */
                    let pixmap = words[++i];
                    if (current === def) {
                        XPUtil.warn(_("Warning: theme config file may not specify a default pixmap, ignoring"));
                    } else if (current === dummy) { // don't bother.
                        continue;
                    } else {
                        /* read in pixmap */
                        if (pixmap[0] !== '/') {
                            // convert to absolute path
                            let tmp = file_name.split('/');
                            tmp[tmp.length - 1] = pixmap;
                            pixmap = tmp.join('/');
                        }

                        /* Pixmap is already defined! */
                        if (current.texture) {
                            XPUtil.warn(_("Warning: resetting pixmap to %s"),
                                pixmap);
                            /* Free old pixmap if it is not a copy */
                            if (!current.master) {
                                current.texture.destroy();
                            }
                        }

                        /* Check if the file has been used before, but only
                         * look in the genii for the current theme */
                        let new_pixmap = true;
                        for (igenus = 0; igenus < added_genii.length && new_pixmap; ++igenus) {
                            gdata = this.toonData[added_genii[igenus]];
                            for (itype in gdata) {
                                /* data already exists in theme, set master */
                                if (gdata.hasOwnProperty(itype) &&
                                        gdata[itype].filename &&
                                        !gdata[itype].master &&
                                        gdata[itype].filename === pixmap) {
                                         // set .master & .texture (& hence .filename)
                                    current.setMaster(gdata[itype]);
                                    new_pixmap = false;
                                    break;
                                }
                            }
                        }

                        /* If we didn't find the pixmap before, it's new */
                        if (new_pixmap) {
                            current.loadTexture(pixmap);
                            current.master = null;
                        }
                    }
                } else if (word === 'number') {
                /* Number of toons */
                    this.number[genus] = parseInt(words[++i], 10);
                } else {
                /* unknown word */
                    XPUtil.warn(_("Warning: Unrecognised word %s, ignoring"),
                        word);
                }
            } // while read word
        } catch (err) {
            XPUtil.error(
                _("Error reading config file: config file ended unexpectedly: Line %d: %s"),
                err.lineNumber,
                err.message
            ); // throws error
            return;
        } /* end config file parsing */

        /* Now valid our widths, heights etc with the size of the image
         * for all the types of the genera we just added
         */
        igenus = added_genii.length;
        while (igenus--) {
            gdata = this.toonData[added_genii[igenus]];
            if (!gdata.walker || !gdata.faller) {
                throw new Error(_("Theme must contain at least walkers and fallers"));
            }
            for (itype in gdata) {
                if (gdata.hasOwnProperty(itype)) {
                    current = gdata[itype];
                    let imwidth = current.texture.width,
                        imheight = current.texture.height;
                    if ((current.nframes = imwidth / current.width) < 1) {
                        if (imwidth < current.width) {
                            throw new Error(_("Width of xpm image too small for even a single frame"));
                        } else {
                            XPUtil.warn(_("Warning: width of %s is too small to display all frames"),
                                current.filename);
                        }
                    }
                    if (imheight < current.height * current.ndirections) {
                        if ((current.ndirections = imheight / current.height) < 1) {
                            throw new Error(_("Height of xpm image too small for even a single frame"));
                        } else {
                            XPUtil.warn(_("Warning: height of %s is too small to display all frames"),
                                current.filename);
                        }
                    }
                }
            } // loop through Toon type
            this.total += this.number[added_genii[igenus]];
            this.totalsPerTheme[name] += this.number[added_genii[igenus]];
        } // loop through added genii
    },  // appendTheme

    grow: function (genus, themeName) {
        if (this.toonData[genus]) {
            return;
        }
        this.toonData[genus] = {};
        this.nactions[genus] = 0;
        this.number[genus] = 1;

        if (!this._themeGenusMap[themeName]) {
            this._themeGenusMap[themeName] = [];
        }
        this._themeGenusMap[themeName].push(genus);
        this.totalsPerTheme[themeName] = 0;
    },

    destroy: function () {
        /* de-allocate all the ToonData textures */
        let i = this.toonData.length;
        while (i--) {
            for (let type in this.toonData[i]) {
                if (this.toonData[i].hasOwnProperty(type)) {
                    this.toonData[i][type].destroy();
                }
            }
        }
    }
};
