#=============================================================================
UUID=xpenguins@mathematical.coffee.gmail.com
FILES=metadata.json *.js stylesheet.css penguin.png themes
DOMAIN=xpenguins
PO=$(wildcard $(UUID)/po/*.po)
#=============================================================================
default_target: all
.PHONY: clean all zip

clean:
	rm -f $(UUID).zip $(UUID)/schemas/gschemas.compiled
	rm -rf $(UUID)/locale

all:
	# compile the schemas
	@if [ -d $(UUID)/schemas ]; then \
		glib-compile-schemas $(UUID)/schemas; \
	fi
	# make translations
	@if [ "$(PO)" ]; then \
		if ! [ -d $(UUID)/locale ]; then \
			mkdir $(UUID)/locale; \
		fi; \
		for f in $(PO); do \
		    lf=`basename $$f .po`; \
			mkdir -p $(UUID)/locale/$$lf/LC_MESSAGES; \
			msgfmt $$f -o $(UUID)/locale/$$lf/LC_MESSAGES/$(DOMAIN).mo; \
		done; \
	fi

zip: all
	zip -rq $(UUID).zip $(FILES:%=$(UUID)/%)

dev-zip: all
	(cd $(UUID); \
		zip -rq ../$(UUID).zip $(FILES))

# From https://github.com/micheleg/dash-to-dock and
# https://live.gnome.org/GnomeShell/Extensions/FAQ/CreatingExtensions
potfile:
	xgettext -k_ -kN_ -c -o $(UUID)/po/$(DOMAIN).pot --package-name "XPenguins" $(UUID)/*.js
