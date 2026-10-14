import { Component, type PropsWithChildren } from "react";
import BrandLogo from "./BrandLogo";

export default class WorkspaceBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="loading-screen">
        <div className="loading-brand"><BrandLogo /></div>
        <div className="loading-content" role="alert">
          <h1>Let’s reopen your workspace.</h1>
          <p>The page could not finish loading. Reload to try again.</p>
        </div>
        <button className="btn btn-primary" onClick={() => location.reload()}>Reload workspace</button>
      </main>
    );
  }
}
