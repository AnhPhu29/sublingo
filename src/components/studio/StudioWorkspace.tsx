"use client";

import React from "react";
import { UnifiedStudioWorkspace } from "./UnifiedStudioWorkspace";

interface StudioWorkspaceProps {
  initialTab?: any;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({ initialTab = "stt" }) => {
  return <UnifiedStudioWorkspace initialTab={initialTab} />;
};
