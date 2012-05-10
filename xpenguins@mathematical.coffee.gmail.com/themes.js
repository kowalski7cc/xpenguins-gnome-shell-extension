/*********************
 * xpenguins_theme.c
 * xpenguins.h
 * Notes:
 * - genus == theme (penguins, simpsons, ...)
 * TODO:
 * - what to do about eror handling? at them oment thorw new Error
 *********************/
warn = function(msg) { 
    log(msg);
    global.log(msg);
};

/***********************
 * ThemeManager object *
 ***********************/
// TODO: make object not class?
function ThemeManager() {
    this._init.apply(this, arguments);
}

ThemeManager.prototype = {
    _init: function() {
        /*
         * Look for themes in
         * $HOME/.xpenguins/themes
         * [xpenguins_directory]/themes
         */
        this.theme_directory = 'themes';
        this.system_directory = GET_EXTENSION_PATH; // metadata.path
        this.user_directory = '.xpenguins';
        this.config_file = 'config';
    },

    list_themes: function() {
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
        config_path = Gio.file_new_for_path('%s/%s/%s/%s/%s'.format(
                home, this.user_directory, this.theme_directory, name, this.config_file));
        if ( config_path.query_exists(null) ) {
            return config_path;
        }

        /* Theme not found in users theme directory... look in [xpenguins_dir]/themes */
        config_path = Gio.file_new_for_path('%s/%s/%s/%s'.format(
                this.system_directory, this.theme_directory, name, this.config_file));
        if ( config_path.query_exists(null) ) {
            return config_path;
        }

        /* Theme not found */
        return null;
    } // theme_path

    }

};


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
        this.ToonData = []; // data, one per genera
        this.names = [];    // theme names
        this.number = [];   // theme penguin numbers
        this.total = 0;     // MIN( sum(numbers), PENGUIN_MAX )
        this.ngenera = 0; // number of different themes (penguins, simpsons, ...)
        this.delay = 0;
        this._nallocated = 0;

        /* Initialise */
        for ( let i=0; i<themeList.length; i++ ) {
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

        /* Alloc some memory __xpenguins_theme_{init,grow}:
         * not necessary for me.
         *
         * add into names, ToonData, number,
         */

        /* Read config file */
        // NOTE: read_next_word is in xpenguins_config.c
        // Skip white space and comments
        while (let word = read_next_word(file_name)) {
            /* define a new genus of toon */
            if ( word == 'toon' ) {
                // stuff

            /* preferred frame delay in milliseconds */
            } else if (word == 'delay') {
                this.delay = parseInt(read_next_word(file_name));

            /* Define default properties of current genus */
            } else if ( word == 'define' ) {
                let type = read_next_word(filename);
                if ( type == 'default' ) {
                    current = &def;
                } else if ( type.match(/^(walker|faller|tumbler|floater|climber|runner|action[0-5]|exit|explosion|splatted|squashed|zapped|angel)$/) ) {
                    __xpenguins_copy_properties(&def, current=theme->data[genus]+type)
                } else {
                    warn(_('Warning: unknown type "%s": ignoring'.format(type)));
                    current = &dummy;
                }
                /* extra configuration */
                if ( type == 'exit' ) {
                    current->conf |= (TOON_NOCYCLE | TOON_INVULNERABLE);
                } else if ( type == 'explosion' ) {
                    current->conf |= (TOON_NOCYCLE | TOON_INVULNERABLE | TOON_NOBLOCK);
                } else if ( type == 'splatted' ) {
                    current->conf |= (TOON_NOCYCLE | TOON_INVULNERABLE);
                } else if ( type == 'squashed' ) {
                    current->conf |= (TOON_NOCYCLE | TOON_INVULNERABLE | TOON_NOBLOCK);
                } else if ( type == 'zapped' ) {
                    current->conf |= (TOON_NOCYCLE | TOON_INVULNERABLE | TOON_NOBLOCK);
                } else if ( type == 'angel' ) {
                    current->conf |= (TOON_INVULNERABLE | TOON_NOBLOCK);
                }

            /* Toon Properties */
            } else if ( word.match(/^(width|height|frames|directions|speed|acceleration|terminal_velocity|loop)$/) ) {
                current[word] = parseInt(read_next_word(file_name));
            } else if ( word == 'pixmap' ) {
                let pixmap = read_next_word(file_name);
                if ( current == &def ) {
                    warn(_('Warning: theme config file may not specify a default pixmap, ignoring'));
                } else if ( current == &dummy ) {
                    continue;
                } else {
                    /* read in pixmap */
	  int status;
	  int igenus, itype; /* For scanning for duplicated pixmaps */
	  char new_pixmap = 1;
	  if (word[0] == '/') {
	    xpm_file_name = word;
	  }
	  else {
	    snprintf(file_base, MAX_STRING_LENGTH, word);
	    xpm_file_name = file_name;
	  }
	  if (current->image) {
	    /* Pixmap is already defined! */
	    WARNING(stderr, _("Warning: resetting pixmap to %s\n"), word);
	    if (!current->master) {
	      /* Free old pixmap if it is not a copy */
	      XpmFree(current->image);
	      current->image = NULL;
	      if (current->filename) {
		free(current->filename);
	      }
	      current->exists = 0;
	    }
	  }

	  /* Check if the file has been used before, but only look in
             the pixmaps for the current theme... */
	  for (igenus = first_genus; igenus <= genus && new_pixmap; ++igenus) {
	    ToonData *data = theme->data[igenus];
	    for (itype = 0; itype < PENGUIN_NTYPES && new_pixmap; ++itype) {
	      if (data[itype].filename && !data[itype].master
		  && data[itype].exists
		  && strcmp(xpm_file_name, data[itype].filename) == 0) {
		current->master = data + itype;
		current->exists = 1;
		current->filename = data[itype].filename;
		current->image = data[itype].image;
		new_pixmap = 0;
	      }
	    }
	  }

	  if (new_pixmap) {
	    status = XpmReadFileToData(xpm_file_name, &(current->image));
	    switch (status) {
	    case XpmSuccess:
	      current->exists = 1;
	      current->filename = strdup(xpm_file_name);
	      current->master = NULL;
	      break;
	    case XpmNoMemory:
	      fclose(config);
	      free(file_name);
	      xpenguins_free_theme(theme);
	      return out_of_memory;
	      break;
	    case XpmOpenFailed:
	      WARNING(stderr, _("Warning: could not read %s\n"), xpm_file_name);
	      break;
	    case XpmFileInvalid:
	      WARNING(stderr, _("Warning: %s is not a valid xpm file\n"), xpm_file_name);
	      break;
	    }
	  }
                } // end pixmap
                else if ( word == 'number' ) {
                    theme.number[genus] = parseInt(read_next_word(file_name));
                } else {
                    warn(_('Warning: Unrecognised word %s, ignoring'.format(word)));
                }
        } // while read word

        // close file
        let themeI = this.ngenera;
        //update theme.ngenera
        this.ngenera++;
        // append to this.data

        /* Now valid our widths, heights etc with the size of the image */
        // loop through the genera we just added (just one)
        let data = this.data[themeI];
        for ( let j=0; j < PENGUINS_NTYPES; j++ ) {
            let current = data[j];
            // sscanf first two %d from current->image[0] to width and height
            let imwidth, imheight;
            if ( (current.nframes = imwidth/current.width) < 1 ) {
                if ( imwidth < current.width ) {
                    throw new Error(_('Width of xpm image too small for even a single frame'));
                    // free data, remove this theme
                } else {
                    warn(_('Warning: width of %s is too small to display all frames'.format(
                                    current.filename));
                }
            }
            if ( imheight < current.height*current.ndirections ) {
                if ( (current.ndirections = imheight/current.height) < 1 ) {
                    throw new Error(_('Height of xpm image too small for even a single frame'));
                    // free data, remove this theme
                } else {
                    warn(_('Warning: height of %s is too small to display all frames'.format(
                                    current.filename));
                }
            }
        }
        if ( !data[PENGIN_WALKER] || !data[PENGUIN_FALLER] ) {
            // free data, remove theme
            throw new Error(_('Theme must contain at least walkers and fallers'));
        }

        /* Update total number */
        this.total += this.number[themeI];
        this.total = Math.max( PENGUIN_MAX, this.total );

    }  // append_theme
}

