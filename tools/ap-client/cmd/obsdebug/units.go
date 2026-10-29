//go:build windows

package main

import (
	"fmt"

	"github.com/hectorgimenez/d2go/pkg/data/state"
	"github.com/hectorgimenez/d2go/pkg/memory"
)

func dumpUnits(gr *memory.GameReader) {
	for _, pu := range gr.GetRawPlayerUnits() {
		fmt.Printf("unit id=%d name=%q main=%v corpse=%v addr=%#x sharedstash=%v d8=%d states=%v\n",
			pu.UnitID, pu.Name, pu.IsMainPlayer, pu.IsCorpse, pu.Address,
			pu.States.HasState(state.Sharedstash), gr.ReadUInt(pu.Address+0xD8, memory.Uint64), pu.States)
	}
}
