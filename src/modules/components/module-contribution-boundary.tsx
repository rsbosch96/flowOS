"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  moduleKey: string;
};

type State = { failed: boolean };

/**
 * Optional action rendering must not take down a Core page. The event is kept
 * intentionally metadata-only so no customer data or provider response leaks.
 */
export class ModuleContributionBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    console.error("module_contribution_render_failed", { moduleKey: this.props.moduleKey });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
