/**
 * Scroll Restore Script — native-app variant.
 *
 * Reads the `scrollTo` URL param, scrolls to that position within the
 * `#chapters` element, then clears the param. Pure logic lives in
 * `@qcksys/ao3tracker-core`; this IIFE just wires it to globals so Gradle can
 * inline the bundle into a Kotlin string constant.
 */
import { consumeScrollToParam } from "@qcksys/ao3tracker-core/dom";

consumeScrollToParam(document, window);
