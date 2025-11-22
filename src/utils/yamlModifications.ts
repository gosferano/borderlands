/**
 * YAML Modification Utilities
 * Helper functions for common save file modifications
 */

import yaml from 'js-yaml';

export interface YamlModification {
  name: string;
  description: string;
  icon: string;
  apply: (yamlString: string) => string;
}

/**
 * Create a custom schema that handles unknown tags (like !tags)
 * by simply ignoring them and treating the data as normal
 */
const CUSTOM_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('!tags', {
    kind: 'sequence',
    construct: (data) => data,
    represent: (data) => data,
  }),
]);

/**
 * Parse YAML string to object
 */
function parseYaml(yamlString: string): any {
  try {
    return yaml.load(yamlString, {
      schema: CUSTOM_SCHEMA,
    });
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${(error as Error).message}`);
  }
}

/**
 * Convert object back to YAML string
 */
function stringifyYaml(data: any): string {
  try {
    return yaml.dump(data, {
      schema: CUSTOM_SCHEMA,
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
  } catch (error) {
    throw new Error(`Failed to stringify YAML: ${(error as Error).message}`);
  }
}

/**
 * Predefined modifications
 */
export const modifications: YamlModification[] = [
  {
    name: 'Character Level 50',
    description: 'Set Character level to 50',
    icon: '⬆️',
    apply: (yamlString: string) => {
      const level = 50;
      const points = 3430227;

      const data = parseYaml(yamlString);

      // Find the Character experience entry
      if (data?.state?.experience && Array.isArray(data.state.experience)) {
        const charExp = data.state.experience.find((exp: any) => exp?.type === 'Character');
        if (charExp) {
          charExp.level = level;
          charExp.points = points;
        }
      }

      return stringifyYaml(data);
    },
  },
  {
    name: 'Money',
    description: 'Set credits to 999,999,999',
    icon: '💰',
    apply: (yamlString: string) => {
      const data = parseYaml(yamlString);

      if (data?.state?.currencies) {
        data.state.currencies.cash = 999999999;
      }

      return stringifyYaml(data);
    },
  },
  {
    name: 'Eridium',
    description: 'Set eridium to 999,999',
    icon: '💎',
    apply: (yamlString: string) => {
      const data = parseYaml(yamlString);

      if (data?.state?.currencies) {
        data.state.currencies.eridium = 999999;
      }

      return stringifyYaml(data);
    },
  },
  {
    name: 'Specialization Level 61',
    description: 'Set Specialization level to 61',
    icon: '🎓',
    apply: (yamlString: string) => {
      const level = 61;
      const points = 7980781;
      const tokens = level - 1;

      const data = parseYaml(yamlString);

      // Find the Specialization experience entry
      if (data?.state?.experience && Array.isArray(data.state.experience)) {
        const specExp = data.state.experience.find((exp: any) => exp?.type === 'Specialization');
        if (specExp) {
          specExp.level = level;
          specExp.points = points;
        }
      }

      // Set specialization token pool
      if (data?.progression?.point_pools) {
        data.progression.point_pools.specializationtokenpool = tokens;
      }

      return stringifyYaml(data);
    },
  },
];

/**
 * Apply a modification to YAML string
 */
export function applyModification(yamlString: string, modification: YamlModification): string {
  try {
    return modification.apply(yamlString);
  } catch (error) {
    throw new Error(`Modification failed: ${(error as Error).message}`);
  }
}
