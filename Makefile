#=============================================================================
EXTENSION=xpenguins
EXTENSION_BASE=@mathematical.coffee.gmail.com
FILES=metadata.json *.js stylesheet.css penguin.png themes
#=============================================================================
default_target: all
.PHONY: clean all zip

clean:
	rm -f $(EXTENSION)$(EXTENSION_BASE).zip

# nothing in this target, just make the zip
all:

zip: clean all
	zip -rq $(EXTENSION)$(EXTENSION_BASE).zip $(FILES:%=$(EXTENSION)$(EXTENSION_BASE)/%)
