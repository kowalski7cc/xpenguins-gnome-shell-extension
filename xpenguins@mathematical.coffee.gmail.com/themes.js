/*********************
 * xpenguins_theme.c
 * xpenguins.h
 * Notes:
 * - genus == theme (penguins, simpsons, ...)
 * TODO:
 * - what to do about eror handling? at them oment thorw new Error
 *
 * GENUS
 *
 * CONFIG FILE:
 *  toon == walker, skater ('genera'), in which there are types
 *   (walker, faller, tumbler, floater, ...)
 *********************/
warn = function(msg) { 
    log(msg);
    global.log(msg);
};

/***********************
 * ThemeManager object *
 ***********************/
// TODO: really no need to make this an object/class...
ThemeManager = {
    /*
     * Look for themes in
     * $HOME/.xpenguins/themes
     * [xpenguins_directory]/themes
     */
    theme_directory: 'themes',
    system_directory: GET_EXTENSION_PATH, // metadata.path
    user_directory: '.xpenguins',
    config_file: 'config',

    /* xpenguins_list_themes */
    /* Return a NULL-terminated list of names of apparently valid themes -
     * basically the directory names from either the user or the system
     * theme directories that contain a file called "config" are
     * returned. Underscores in the directory names are converted into
     * spaces, but directory names that already contain spaces are
     * rejected. This is because the install program seems to choke on
     * directory names containing spaces, but theme names containing
     * underscores are ugly. 
     */
    list_themes: function() {
        let home = GLib.get_home_dir();

        let config_path;

        /* first look in $HOME/.xpenguins/themes for config */
        config_path = '%s/%s/%s/*%s'.format(
                home, this.user_directory, this.theme_directory, this.config_file);
        // glob it.

        /* Theme not found in users theme directory... look in [xpenguins_dir]/themes */
        config_path = '%s/%s/*%s'.format(
                this.system_directory, this.theme_directory, this.config_file);
        // TODO
        // glob it
        // err don't seem to be able to list children of a dir?

        let themeList = [];
      /* We convert all underscores in the directory name 
       * to spaces, but actual spaces in the directory
       * name are not allowed. */
        themeList = themeList.filter( function(x) !x.match(' ') );
        themeList = themeList.map( function(x) x.replace(/_/g,' ');

        // TODO: remove duplicates

        return themeList;
        // NOTE: themeList has to be *names* not full paths.
    },

    // xpenguins_theme_info(char *name)
    theme_info: function(iname) {
    },

    /* Return the full path of the specified theme.
     * Spaces in theme name are converted to underscores
     */
    get_theme_path: function(iname) {
        let home = GLib.get_home_dir();
        let config_path;
        /* Convert spaces to underscores */
        let name = iname.replace(/ /g,'_');

        /* first look in $HOME/.xpenguins/themes for config */
        config_path = '%s/%s/%s/%s/%s'.format(
                home, this.user_directory, this.theme_directory, name, this.config_file);
        if ( GLib.file_test(config_path, GLib.FileTest.EXISTS) ) {
            return config_path;
        }

        /* Theme not found in users theme directory... look in [xpenguins_dir]/themes */
        config_path = '%s/%s/%s/%s'.format(
                this.system_directory, this.theme_directory, name, this.config_file);
        if ( GLib.file_test(config_path, GLib.FileTest.EXISTS) ) {
            return config_path;
        }

        /* Theme not found */
        return null;
    } // theme_path
}; // ThemeManager


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
    _init: function( themeList ) {
        /* members */
        /* Theme: can have one or more genera
         * Genus: class of toons (Penguins has 2: walker & skateboarder).
         * Each genus has toon types: walker, floater, tumbler, faller, ...
         */
        this.ToonData = []; // data, one per genus
        this.name = [];    // names of genus
        this.number = [];   // theme penguin numbers
        this.total = 0;     // MIN( sum(numbers), PENGUIN_MAX )
        this.ngenera = 0; // number of different genera
        this.delay = 60;

        /* Initialise */
        for ( let i=0; i<themeList.length; ++i ) {
            this.append_theme( themeList[i] );
        }
    }, // _init

    /* Append the theme named "name" to this theme.
     * To initialise the theme, set theme.ngenera to 0 before
     *  calling this function.
     */
    append_theme: function( name ) {
        /* find theme */
        let file_name = ThemeManager.get_theme_path(name);
        if ( !file_name ) {
            throw new Error('Theme ' + name + ' not found or config file not present');
            return null;
        }

        /* Read config file, ignoring comments ('#') and whitespace */
        let words = Shell.get_file_contents_utf8_sync(file_name);
        words = words.replace(/#.+/g,'');
        words = words.replace(/\s+/g,' ');
        words = words.trim().split(' ');

        /* iterate through the words to parse the config file. */
        let started=false; // whether we've started parsing a toon

        let first_genera = this.ngenera; // original number of genera
        let genus = this.ngenera; // current index into ToonData etc.

        let current;   // the current toon
        let def = {};  // holds the default toon's properties
        let dummy = {};// any unknown toon's properties.
        // TODO: encase in a tryCatch: config file ended unexpectedly.
        for ( let i=0; i<words.length; ++i ) {
            let word=words[i];
            /* define a new genus of toon (walker, skateboarder, ...) */
            if ( word == 'toon' ) {
                let toonName = words[++i];
                if ( started ) {
                    /* initialise new genus */
                    this.grow();
                    ++genus;
                } else {
                    started=true;
                }
                // TODO: if started, ++genus is out of bounds?
                this.name[genus] = toonName;
            }
            /* preferred frame delay in milliseconds */
            else if (word == 'delay') {
                this.delay = parseInt(words[++i]);
            }
            /* Various types of toon */
            else if ( word == 'define' ) {
                let type = words[++i];
                /* Define default properties of current genus */
                if ( type == 'default' ) {
                    current = def;
                } 
                /* other types of toon */
                else if ( type.match(/^(walker|faller|tumbler|floater|climber|runner|action[0-5]|exit|explosion|splatted|squashed|zapped|angel)$/) ) {
                    started = 1;
                    current = this.ToonData[genus][type] = new ToonData(def);
                } else {
                    warn(_('Warning: unknown type "%s": ignoring'.format(type)));
                    current = dummy;
                }
                /* extra configuration */
                if ( type == 'exit' ) {
                    current.conf |= (TOON.NOCYCLE | TOON.INVULNERABLE);
                } else if ( type == 'explosion' ) {
                    current.conf |= (TOON.NOCYCLE | TOON.INVULNERABLE | TOON.NOBLOCK);
                } else if ( type == 'splatted' ) {
                    current.conf |= (TOON.NOCYCLE | TOON.INVULNERABLE);
                } else if ( type == 'squashed' ) {
                    current.conf |= (TOON.NOCYCLE | TOON.INVULNERABLE | TOON.NOBLOCK);
                } else if ( type == 'zapped' ) {
                    current.conf |= (TOON.NOCYCLE | TOON.INVULNERABLE | TOON.NOBLOCK);
                } else if ( type == 'angel' ) {
                    current.conf |= (TOON.INVULNERABLE | TOON.NOBLOCK);
                }
            } 
            /* Toon Properties */
            else if ( word.match(/^(width|height|speed|acceleration|terminal_velocity|loop)$/) ) {
                current[word] = parseInt(words[++i]);
            } 
            else if ( word.match(/^(frames|directions)/) { 
                current['n' + word] = parseInt(words[++i]);
            }
            /* Pixmap */
            else if ( word == 'pixmap' ) {
                let pixmap = words[++i];
                if ( current == def ) {
                    warn(_('Warning: theme config file may not specify a default pixmap, ignoring'));
                } else if ( current = dummy ) { // don't bother.
                    continue;
                } else {
                    /* read in pixmap */
                    if ( pixmap[0] ) != '/' ) {
                        // convert to absolute path
                        let tmp = file_name.split('/');
                        tmp[tmp.length-1] = pixmap;
                        pixmap = tmp.join('/'); 
                    }

                    /* Pixmap is already defined! */
                    if ( current.image ) {
                        warn(_('Warning: resetting pixmap to %s'.format(pixmap)));
                        /* Free old pixmap if it is not a copy */
                        if ( !current.master ) {
                            // TODO: XpmFree(current.image) (release memory!)
                            // How to release memory in Javascript?
                            current.image = null;
                            current.filename = null;
                            current.exists = false;
                        }
                    }

                    /* Check if the file has been used before, but only look in
                       the pixmaps for the current theme... */
                    let new_pixmap = 1;
                    for ( let igenus=first_genus; igenus <= genus && new_pixmap; ++igenus ) {
                        let data = this.ToonData[igenus];
                        // note: ToonData[igenus] is an *object* type: ToonData
                        for ( let itype in data ) { 
                            /* data already exists in theme, set master */
                            if ( data[itype].filename && !data[itype].master
                                 && data[itype].exists
                                 && data[itype].filename == pixmap ) {
                                     current.master = data[itype];
                                     current.exists = 1;
                                     current.filename = data[itype].filename;
                                     current.image = data[itype].image;
                                     new_pixmap = 0;
                                     break;
                            }
                        }
                    }

                    /* If we didn't find the pixmap before, it's new */
                    if ( new_pixmap ) {
                        // TODO:
                        current.image = XpmReadFileToData(pixmap);
                        // various error messages: no memory, open failed, invalid xpm
                        // But if it all worked:
                        current.exists = 1;
                        current.filename = pixmap;
                        current.master = null;
                    }
                }
            } // end pixmap
            /* Number of toons */
            else if ( word == 'number' ) {
                theme.number[genus] = parseInt(words[++i]);
            } 
            /* unknown word */
            else {
                warn(_('Warning: Unrecognised word %s, ignoring'.format(word)));
            }
        } // while read word

        this.ngenera = genus+1;

        /* Now valid our widths, heights etc with the size of the image
         * for all the types of the genera we just added
         */
        for ( let i=first_genus; i < theme.ngenera; ++i ) {
            for ( let j in this.ToonData[i] ) {
                let current = this.ToonData[i][j];
                if ( !current.exists ) {
                    continue;
                }
                // sscanf first two %d from current->image[0] to width and height
                let imwidth, imheight;
                if ( (current.nframes = imwidth/current.width) < 1 ) {
                    if ( imwidth < current.width ) {
                        throw new Error(_('Width of xpm image too small for even a single frame'));
                    } else {
                        warn(_('Warning: width of %s is too small to display all frames'.format(
                                        current.filename));
                    }
                }
                if ( imheight < current.height*current.ndirections ) {
                    if ( (current.ndirections = imheight/current.height) < 1 ) {
                        throw new Error(_('Height of xpm image too small for even a single frame'));
                    } else {
                        warn(_('Warning: height of %s is too small to display all frames'.format(
                                        current.filename));
                    }
                }
            } // loop through Toon type
            if ( !this.ToonData[i]['walker'].exists || !this.ToonData[i]['faller'].exists ) {
                throw new Error(_('Theme must contain at least walkers and fallers'));
            }
        }

        /* Update total number */
        // NOTE: original code sets theme.total = 0
        // and only adds the numbers of the genera we *just* added?
        // i.e. theme.total = sum( theme.number[first_genus:theme.ngenera] )
        this.total = Math.max( PENGUIN_MAX,
            this.number.reduce( function(x,y) x+y ) );
    },  // append_theme
    /* BIG TODO: grow() already does ++this.ngenera: does this screw things up? */

    grow = function() {
        this.name.push('');
        this.number.push(1);
        this.ToonData.push({}); // object 'toonType': ToonData
        ++this.ngenera;
    },

    _onDestroy: function() {
        // xpenguins_free_theme
        // go through everything & deallocate, particularly images
    }
}

