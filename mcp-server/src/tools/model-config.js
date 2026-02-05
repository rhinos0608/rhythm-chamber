/**
 * Model Configuration Tool
 *
 * Configure which embedding model to use for semantic search.
 * Allows runtime switching between models without tool parameters.
 *
 * @module tools/model-config
 */

import { getModelConfig } from '../semantic/model-config.js';

/**
 * Tool schema
 */
export const schema = {
  name: 'model_config',
  description: `
Configure the active embedding model for semantic search.

This allows you to switch between different embedding models at runtime
without passing model names in every tool call. The configured model will
be used for all semantic search operations.

Actions:
- set_active: Set the active model (e.g., "Xenova/gte-base", "text-embedding-embeddinggemma-300m")
- get_active: Get the current active model
- list_available: List all available models with details
- set_comparison: Set models for comparison analysis
- get_comparison: Get comparison models
- reset: Reset to default configuration

Examples:
1. Set active model: {"action": "set_active", "model": "text-embedding-embeddinggemma-300m"}
2. Get current model: {"action": "get_active"}
3. List available models: {"action": "list_available"}
4. Set comparison models: {"action": "set_comparison", "models": ["Xenova/gte-base", "jinaai/jina-embeddings-v2-base-code"]}
  `,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['set_active', 'get_active', 'list_available', 'set_comparison', 'get_comparison', 'reset'],
        description: 'Configuration action to perform',
      },
      model: {
        type: 'string',
        description: 'Model name (for set_active action)',
      },
      models: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of model names (for set_comparison action)',
      },
    },
  },
};

/**
 * Tool handler
 */
export async function handler(args, projectRoot) {
  const { action, model, models } = args;

  try {
    const config = getModelConfig();

    switch (action) {
      case 'set_active':
        if (!model) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { error: 'model parameter is required for set_active action' },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        {
          const result = config.setActiveModel(model);
          if (!result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: `Active model set to ${model}`,
                    ...result,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

      case 'get_active': {
        const activeModel = config.getActiveModel();
        const availableModels = config.getAvailableModels();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  activeModel,
                  modelInfo: availableModels[activeModel],
                  message: `Current active model: ${activeModel}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'list_available': {
        const allModels = config.getAvailableModels();

        // Group by provider
        const grouped = {};
        for (const [name, info] of Object.entries(allModels)) {
          if (!grouped[info.provider]) {
            grouped[info.provider] = [];
          }
          grouped[info.provider].push({ name, ...info });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Available embedding models',
                  providers: grouped,
                  total: Object.keys(allModels).length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'set_comparison':
        if (!models || models.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { error: 'models array is required for set_comparison action' },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        {
          const comparisonResult = config.setComparisonModels(models);
          if (!comparisonResult.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(comparisonResult, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: `Comparison models set: ${models.join(', ')}`,
                    ...comparisonResult,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

      case 'get_comparison': {
        const comparisonModels = config.getComparisonModels();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  comparisonModels,
                  count: comparisonModels.length,
                  message: comparisonModels.length > 0
                    ? `Comparison models: ${comparisonModels.join(', ')}`
                    : 'No comparison models configured',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'reset':
        config.reset();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Configuration reset to defaults',
                  activeModel: config.getActiveModel(),
                },
                null,
                2
              ),
            },
          ],
        };

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: `Unknown action: ${action}`,
                  availableActions: [
                    'set_active',
                    'get_active',
                    'list_available',
                    'set_comparison',
                    'get_comparison',
                    'reset',
                  ],
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.message,
              stack: error.stack,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
