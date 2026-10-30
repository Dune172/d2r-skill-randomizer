//go:build windows

package main

import (
	"fmt"

	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/apc"
	"github.com/Dune172/d2r-skill-randomizer/tools/ap-client/internal/manifest"
)

// buildID is set by scripts/publish-ap-client.mjs (-ldflags -X main.buildID=...): the
// commit the published app was built from.
var buildID = "dev"

// version prints what the app speaks. CI compares the copy published on the site with
// the source, so a site and an app that would refuse each other cannot ship together.
func version() int {
	fmt.Printf("d2rr-ap build %s manifest-contract %d slot-contract %d\n",
		buildID, manifest.ContractVersion, apc.SlotContractVersion)
	return 0
}
