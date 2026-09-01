// Rations' entry point (#301), the second of the two the build has.
//
// Above `./Rations.svelte`, so the boot guard `mount-facet` installs is
// listening before the food graph below evaluates.
import { mountFacet } from "./mount-facet";
import { facetOf } from "./lib/facets/registry";
import Rations from "./Rations.svelte";

// **Which Facet is running, named here and nowhere else** (ADR-0076 §6). A
// literal, one per entry point, never a check against `location.pathname`: see
// `mountFacet` for what that check would cost.
export default mountFacet(facetOf("food"), Rations);
