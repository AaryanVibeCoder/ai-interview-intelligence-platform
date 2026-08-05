"use client";

import * as React from "react";

type ProviderComponent = React.ComponentType<React.PropsWithChildren>;

export function composeProviders(providers: readonly ProviderComponent[]) {
  function ComposedProviders({ children }: React.PropsWithChildren) {
    return providers.reduceRight(
      (tree, Provider) => <Provider>{tree}</Provider>,
      children,
    );
  }

  ComposedProviders.displayName = "ComposedProviders";

  return ComposedProviders;
}
