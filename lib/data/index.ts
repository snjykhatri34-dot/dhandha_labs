// The only entry point to data for pages, server actions and route handlers.
// DATA_SOURCE=mock (default) | supabase
import "server-only";

import { mockDataLayer } from "./mock";
import { supabaseDataLayer } from "./supabase";
import type { DataLayer } from "./types";

export type * from "./types";

export const dataSource = process.env.DATA_SOURCE === "supabase" ? "supabase" : "mock";

const layer: DataLayer = dataSource === "supabase" ? supabaseDataLayer : mockDataLayer;

export const visits = layer.visits;
export const reports = layer.reports;
export const analyser = layer.analyser;
