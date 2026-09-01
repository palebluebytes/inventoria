// Inventoria's entry point: the root Facet, all six tabs (ADR-0076 §2).
//
// Above `./App.svelte`, so the boot guard `mount-facet` installs is listening
// before the app graph below evaluates.
import { mountFacet } from "./mount-facet";
import { facetOf } from "./lib/facets/registry";
import App from "./App.svelte";

export default mountFacet(facetOf("root"), App);
