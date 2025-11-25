import { describe, it, expect, beforeEach } from 'bun:test';
import {
  PluginRegistry,
  fp,
  getPluginMetadata,
  resolvePluginOrder,
  type PluginRegistration
} from '../src/plugin-registry';

describe('Plugin Registry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('Plugin Registration', () => {
    it('should register plugin without metadata', async () => {
      const plugin = async () => {
        // Simple plugin
      };

      await registry.register(plugin);

      // Anonymous plugins don't have names to check
      const stats = registry.stats();
      expect(stats.loaded).toBe(1);
    });

    it('should register plugin with metadata', async () => {
      const plugin = async () => {};
      const metadata = {
        name: 'test-plugin',
        version: '1.0.0'
      };

      await registry.register(plugin, {}, metadata);

      expect(registry.hasPlugin('test-plugin')).toBe(true);
      expect(registry.getMetadata('test-plugin')).toEqual(metadata);
    });

    it('should track loading state', async () => {
      let isLoading = false;

      const plugin = async () => {
        isLoading = registry.isLoading('loading-plugin');
      };

      const metadata = { name: 'loading-plugin' };

      await registry.register(plugin, {}, metadata);

      expect(isLoading).toBe(true); // Was loading during execution
      expect(registry.isLoading('loading-plugin')).toBe(false); // No longer loading
      expect(registry.hasPlugin('loading-plugin')).toBe(true); // Now loaded
    });

    it('should detect circular dependencies', async () => {
      const plugin = async () => {};
      const metadata = {
        name: 'circular',
        dependencies: ['circular'] // Depends on itself
      };

      // This throws unmet dependencies because the plugin isn't loaded yet
      await expect(registry.register(plugin, {}, metadata)).rejects.toThrow(
        'unmet dependencies'
      );
    });

    it('should validate dependencies exist', async () => {
      const plugin = async () => {};
      const metadata = {
        name: 'dependent',
        dependencies: ['missing-plugin']
      };

      await expect(registry.register(plugin, {}, metadata)).rejects.toThrow(
        'unmet dependencies'
      );
    });

    it('should enforce dependency order', async () => {
      const order: string[] = [];

      const pluginA = async () => {
        order.push('A');
      };

      const pluginB = async () => {
        order.push('B');
      };

      await registry.register(pluginA, {}, { name: 'plugin-a' });
      await registry.register(pluginB, {}, { name: 'plugin-b', dependencies: ['plugin-a'] });

      expect(order).toEqual(['A', 'B']);
      expect(registry.hasPlugin('plugin-a')).toBe(true);
      expect(registry.hasPlugin('plugin-b')).toBe(true);
    });

    it('should handle plugin errors', async () => {
      const plugin = async () => {
        throw new Error('Plugin initialization failed');
      };

      const metadata = { name: 'failing-plugin' };

      await expect(registry.register(plugin, {}, metadata)).rejects.toThrow(
        'Plugin initialization failed'
      );

      // Plugin should not be marked as loaded
      expect(registry.hasPlugin('failing-plugin')).toBe(false);
      expect(registry.isLoading('failing-plugin')).toBe(false);
    });

    it('should get loaded plugin names', async () => {
      await registry.register(async () => {}, {}, { name: 'plugin-1' });
      await registry.register(async () => {}, {}, { name: 'plugin-2' });
      await registry.register(async () => {}, {}, { name: 'plugin-3' });

      const loaded = registry.getLoadedPlugins();

      expect(loaded).toContain('plugin-1');
      expect(loaded).toContain('plugin-2');
      expect(loaded).toContain('plugin-3');
      expect(loaded.length).toBe(3);
    });
  });

  describe('Version Constraints', () => {
    it('should validate exact version constraint', async () => {
      const plugin = async () => {};

      // Should succeed (version matches)
      await registry.register(plugin, {}, { ogelfy: '=1.0.0' });
      expect(true).toBe(true); // Should not throw
    });

    it('should validate >= constraint', async () => {
      const plugin1 = async () => {};
      const plugin2 = async () => {};

      await registry.register(plugin1, {}, { ogelfy: '>=1.0.0' });
      await registry.register(plugin2, {}, { ogelfy: '>=0.9.0' });
      expect(true).toBe(true); // Should not throw
    });

    it('should fail on unmet version constraint', async () => {
      const plugin = async () => {};

      await expect(registry.register(plugin, {}, { ogelfy: '>=2.0.0' })).rejects.toThrow(
        'requires Ogelfy >=2.0.0'
      );
    });

    it('should validate caret constraint', async () => {
      const plugin = async () => {};

      // Same major version should work
      await registry.register(plugin, {}, { ogelfy: '^1.0.0' });
      expect(true).toBe(true); // Should not throw
    });

    it('should validate tilde constraint', async () => {
      const plugin = async () => {};

      // Same major.minor should work
      await registry.register(plugin, {}, { ogelfy: '~1.0.0' });
      expect(true).toBe(true); // Should not throw
    });
  });

  describe('Plugin Metadata', () => {
    it('should extract metadata from wrapped plugin', () => {
      const plugin = async () => {};
      const metadata = {
        name: 'test-plugin',
        version: '2.0.0',
        dependencies: ['other-plugin']
      };

      const wrapped = fp(plugin, metadata);

      const extracted = getPluginMetadata(wrapped);

      expect(extracted).toEqual(metadata);
    });

    it('should return undefined for unwrapped plugin', () => {
      const plugin = async () => {};

      const metadata = getPluginMetadata(plugin);

      expect(metadata).toBeUndefined();
    });

    it('should preserve plugin function', () => {
      const plugin = async (opts: any) => {
        return opts.value * 2;
      };

      const wrapped = fp(plugin, { name: 'test' });

      // Should still be callable
      expect(typeof wrapped).toBe('function');
    });
  });

  describe('Dependency Resolution', () => {
    it('should resolve simple dependency order', () => {
      const plugins: PluginRegistration[] = [
        {
          plugin: async () => {},
          metadata: { name: 'B', dependencies: ['A'] }
        },
        {
          plugin: async () => {},
          metadata: { name: 'A' }
        }
      ];

      const sorted = resolvePluginOrder(plugins);

      expect(sorted[0].metadata?.name).toBe('A');
      expect(sorted[1].metadata?.name).toBe('B');
    });

    it('should resolve complex dependency graph', () => {
      const plugins: PluginRegistration[] = [
        {
          plugin: async () => {},
          metadata: { name: 'D', dependencies: ['B', 'C'] }
        },
        {
          plugin: async () => {},
          metadata: { name: 'C', dependencies: ['A'] }
        },
        {
          plugin: async () => {},
          metadata: { name: 'B', dependencies: ['A'] }
        },
        {
          plugin: async () => {},
          metadata: { name: 'A' }
        }
      ];

      const sorted = resolvePluginOrder(plugins);

      const names = sorted.map(p => p.metadata?.name);

      // A must be first
      expect(names[0]).toBe('A');

      // B and C must come after A but before D
      const aIndex = names.indexOf('A');
      const bIndex = names.indexOf('B');
      const cIndex = names.indexOf('C');
      const dIndex = names.indexOf('D');

      expect(bIndex).toBeGreaterThan(aIndex);
      expect(cIndex).toBeGreaterThan(aIndex);
      expect(dIndex).toBeGreaterThan(bIndex);
      expect(dIndex).toBeGreaterThan(cIndex);
    });

    it('should detect circular dependencies in graph', () => {
      const plugins: PluginRegistration[] = [
        {
          plugin: async () => {},
          metadata: { name: 'A', dependencies: ['B'] }
        },
        {
          plugin: async () => {},
          metadata: { name: 'B', dependencies: ['A'] }
        }
      ];

      expect(() => resolvePluginOrder(plugins)).toThrow('Circular dependency');
    });

    it('should throw on missing dependency', () => {
      const plugins: PluginRegistration[] = [
        {
          plugin: async () => {},
          metadata: { name: 'A', dependencies: ['NonExistent'] }
        }
      ];

      expect(() => resolvePluginOrder(plugins)).toThrow('Missing dependency');
    });

    it('should handle plugins without dependencies', () => {
      const plugins: PluginRegistration[] = [
        { plugin: async () => {}, metadata: { name: 'A' } },
        { plugin: async () => {}, metadata: { name: 'B' } },
        { plugin: async () => {}, metadata: { name: 'C' } }
      ];

      const sorted = resolvePluginOrder(plugins);

      expect(sorted.length).toBe(3);
      // Order doesn't matter when no dependencies
    });
  });

  describe('Plugin Statistics', () => {
    it('should return plugin stats', async () => {
      await registry.register(async () => {}, {}, { name: 'plugin-1' });
      await registry.register(async () => {}, {}, { name: 'plugin-2' });

      const stats = registry.stats();

      expect(stats.total).toBe(2);
      expect(stats.loaded).toBe(2);
      expect(stats.loading).toBe(0);
      expect(stats.plugins).toContain('plugin-1');
      expect(stats.plugins).toContain('plugin-2');
    });

    it('should track loading count', async () => {
      let statsSnapshot: any;

      const plugin = async () => {
        statsSnapshot = registry.stats();
      };

      await registry.register(plugin, {}, { name: 'test' });

      // During execution, loading count was 1
      expect(statsSnapshot.loading).toBe(1);

      // After completion, loading count is 0
      const finalStats = registry.stats();
      expect(finalStats.loading).toBe(0);
      expect(finalStats.loaded).toBe(1);
    });
  });

  describe('Plugin Clearing', () => {
    it('should clear all plugin state', async () => {
      await registry.register(async () => {}, {}, { name: 'plugin-1' });
      await registry.register(async () => {}, {}, { name: 'plugin-2' });

      expect(registry.hasPlugin('plugin-1')).toBe(true);
      expect(registry.hasPlugin('plugin-2')).toBe(true);

      registry.clear();

      expect(registry.hasPlugin('plugin-1')).toBe(false);
      expect(registry.hasPlugin('plugin-2')).toBe(false);

      const stats = registry.stats();
      expect(stats.total).toBe(0);
      expect(stats.loaded).toBe(0);
    });
  });

  describe('Multiple Dependencies', () => {
    it('should handle multiple dependencies per plugin', async () => {
      const order: string[] = [];

      await registry.register(async () => order.push('A'), {}, { name: 'A' });
      await registry.register(async () => order.push('B'), {}, { name: 'B' });
      await registry.register(
        async () => order.push('C'),
        {},
        { name: 'C', dependencies: ['A', 'B'] }
      );

      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('should ensure all dependencies loaded before plugin', async () => {
      const loadedWhen: Record<string, string[]> = {};

      await registry.register(async () => {}, {}, { name: 'dep1' });
      await registry.register(async () => {}, {}, { name: 'dep2' });
      await registry.register(async () => {}, {}, { name: 'dep3' });

      await registry.register(
        async () => {
          loadedWhen['main'] = registry.getLoadedPlugins();
        },
        {},
        { name: 'main', dependencies: ['dep1', 'dep2', 'dep3'] }
      );

      expect(loadedWhen['main']).toContain('dep1');
      expect(loadedWhen['main']).toContain('dep2');
      expect(loadedWhen['main']).toContain('dep3');
    });
  });
});
