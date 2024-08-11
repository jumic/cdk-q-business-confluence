import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as q from 'aws-cdk-lib/aws-qbusiness';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';

interface QBusinessStackProps extends cdk.StackProps {
  identityCenterInstanceArn: string;
  confluenceHostUrl: string;
}

export class CdkQBusinessConfluenceStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: QBusinessStackProps,
  ) {
    super(scope, id, props);

    // Confluence authentication credentials
    const encryptionKey = new kms.Key(
      this,
      'QBusinessKey',
      {
        alias: 'QBusinessKey',
        pendingWindow: cdk.Duration.days(7),
        removalPolicy: cdk.RemovalPolicy.DESTROY, // for testing only
      },
    );

    const secret = new secretsmanager.Secret(
      this,
      'Secret',
      {
        secretObjectValue: {
          username: cdk.SecretValue.unsafePlainText(
            'dummy value - please chanage manually after deployment',
          ),
          hostUrl: cdk.SecretValue.unsafePlainText(
            'dummy value - please chanage manually after deployment',
          ),
          password: cdk.SecretValue.unsafePlainText(
            'dummy value - please chanage manually after deployment',
          ),
        },
        encryptionKey,
      },
    );

    // IAM policy and role for the Q Business application
    const applicationPolicy = new iam.ManagedPolicy(
      this,
      'ApplicationPolicy',
      {
        statements: [
          new iam.PolicyStatement({
            sid: 'AmazonQApplicationPutMetricDataPermission',
            actions: ['cloudwatch:PutMetricData'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'cloudwatch:namespace': 'AWS/QBusiness',
              },
            },
          }),
          new iam.PolicyStatement({
            sid: 'AmazonQApplicationDescribeLogGroupsPermission',
            actions: ['logs:DescribeLogGroups'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'AmazonQApplicationCreateLogGroupPermission',
            actions: ['logs:CreateLogGroup'],
            resources: [
              `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/qbusiness/*`,
            ],
          }),
          new iam.PolicyStatement({
            sid: 'AmazonQApplicationLogStreamPermission',
            actions: [
              'logs:DescribeLogStreams',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            resources: [
              `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/qbusiness/*:log-stream:*`,
            ],
          }),
        ],
      },
    );

    const applicationRole = new iam.Role(
      this,
      'ApplicationRole',
      {
        assumedBy: new iam.ServicePrincipal(
          'qbusiness.amazonaws.com',
          {
            conditions: {
              StringEquals: {
                'aws:SourceAccount': this.account,
              },
              ArnLike: {
                'aws:SourceArn': `arn:aws:qbusiness:${this.region}:${this.account}:application/*`,
              },
            },
          },
        ),
        managedPolicies: [applicationPolicy],
      },
    );

    // Q Business application
    const application = new q.CfnApplication(
      this,
      'Application',
      {
        displayName: 'CDK_QBusiness',
        identityCenterInstanceArn:
          props.identityCenterInstanceArn,
        roleArn: applicationRole.roleArn,
      },
    );

    // Q Business index
    const index = new q.CfnIndex(this, 'Index', {
      type: 'STARTER',
      capacityConfiguration: {
        units: 1,
      },
      applicationId: application.attrApplicationId,
      displayName: 'Index',
    });

    // Q Business retriever
    new q.CfnRetriever(this, 'Retriever', {
      type: 'NATIVE_INDEX',
      applicationId: application.attrApplicationId,
      displayName: 'Retriever',
      configuration: {
        nativeIndexConfiguration: {
          indexId: index.attrIndexId,
        },
      },
    });

    // IAM policy and role for the Q Business web experience
    const principal = new iam.ServicePrincipal(
      'application.qbusiness.amazonaws.com',
      {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
          ArnEquals: {
            'aws:SourceArn': application.attrApplicationArn,
          },
        },
      },
    );

    const webExperiencePolicy = new iam.ManagedPolicy(
      this,
      'WebExperiencePolicy',
      {
        statements: [
          new iam.PolicyStatement({
            sid: 'QBusinessConversationPermission',
            actions: [
              'qbusiness:Chat',
              'qbusiness:ChatSync',
              'qbusiness:ListMessages',
              'qbusiness:ListConversations',
              'qbusiness:DeleteConversation',
              'qbusiness:PutFeedback',
              'qbusiness:GetWebExperience',
              'qbusiness:GetApplication',
              'qbusiness:ListPlugins',
              'qbusiness:GetChatControlsConfiguration',
            ],
            resources: [application.attrApplicationArn],
          }),
          new iam.PolicyStatement({
            sid: 'QBusinessQAppsPermissions',
            actions: [
              'qapps:CreateQApp',
              'qapps:PredictProblemStatementFromConversation',
              'qapps:PredictQAppFromProblemStatement',
              'qapps:CopyQApp',
              'qapps:GetQApp',
              'qapps:ListQApps',
              'qapps:UpdateQApp',
              'qapps:DeleteQApp',
              'qapps:AssociateQAppWithUser',
              'qapps:DisassociateQAppFromUser',
              'qapps:ImportDocumentToQApp',
              'qapps:ImportDocumentToQAppSession',
              'qapps:CreateLibraryItem',
              'qapps:GetLibraryItem',
              'qapps:UpdateLibraryItem',
              'qapps:CreateLibraryItemReview',
              'qapps:ListLibraryItems',
              'qapps:CreateSubscriptionToken',
              'qapps:StartQAppSession',
              'qapps:StopQAppSession',
            ],
            resources: [application.attrApplicationArn],
          }),
        ],
      },
    );

    const webExperienceRole = new iam.Role(
      this,
      'WebExperienceRole',
      {
        assumedBy: principal,
        managedPolicies: [webExperiencePolicy],
      },
    );

    webExperienceRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        actions: ['sts:SetContext'],
        principals: [principal],
      }),
    );

    // Q Business web experience
    new q.CfnWebExperience(this, 'WebExperience', {
      applicationId: application.attrApplicationId,
      roleArn: webExperienceRole.roleArn,
    });

    // IAM policy and role for the Q Business Confluence Data Source
    const confluenceDataSourcePolicy =
      new iam.ManagedPolicy(
        this,
        'ConfluenceDataSourcePolicy',
        {
          statements: [
            new iam.PolicyStatement({
              sid: 'AllowsAmazonQToGetS3Objects',
              actions: ['s3:GetObject'],
              resources: ['arn:aws:s3:::bucket/*'],
              conditions: {
                StringEquals: {
                  'aws:ResourceAccount': this.account,
                },
              },
            }),
            new iam.PolicyStatement({
              sid: 'AllowsAmazonQToGetSecret',
              actions: ['secretsmanager:GetSecretValue'],
              resources: [secret.secretArn],
            }),
            new iam.PolicyStatement({
              sid: 'AllowsAmazonQToDecryptSecret',
              actions: ['kms:Decrypt'],
              resources: [encryptionKey.keyArn],
              conditions: {
                StringLike: {
                  'kms:ViaService': [
                    'secretsmanager.*.amazonaws.com',
                  ],
                },
              },
            }),
            new iam.PolicyStatement({
              sid: 'AllowsAmazonQToIngestDocuments',
              actions: [
                'qbusiness:BatchPutDocument',
                'qbusiness:BatchDeleteDocument',
              ],
              resources: [index.attrIndexArn],
            }),
            new iam.PolicyStatement({
              sid: 'AllowsAmazonQToIngestPrincipalMapping',
              actions: [
                'qbusiness:PutGroup',
                'qbusiness:CreateUser',
                'qbusiness:DeleteGroup',
                'qbusiness:UpdateUser',
                'qbusiness:ListGroups',
              ],
              resources: [
                application.attrApplicationArn,
                index.attrIndexArn,
                `${index.attrIndexArn}/data-source/*`,
              ],
            }),
          ],
        },
      );

    const confluenceDataSourceRole = new iam.Role(
      this,
      'ConfluenceDataSourceRole',
      {
        assumedBy: new iam.ServicePrincipal(
          'qbusiness.amazonaws.com',
          {
            conditions: {
              StringEquals: {
                'aws:SourceAccount': this.account,
              },
              ArnEquals: {
                'aws:SourceArn':
                  application.attrApplicationArn,
              },
            },
          },
        ),
        managedPolicies: [confluenceDataSourcePolicy],
      },
    );

    // Q Business Confluence Data Source
    new q.CfnDataSource(this, 'ConfluenceDataSource', {
      applicationId: application.attrApplicationId,
      displayName: 'ConfluenceDataSource',
      indexId: index.attrIndexId,
      configuration: {
        secretArn: secret.secretArn,
        syncMode: 'FORCED_FULL_CRAWL',
        enableIdentityCrawler: true,
        connectionConfiguration: {
          repositoryEndpointMetadata: {
            type: 'SAAS',
            hostUrl: props.confluenceHostUrl,
            authType: 'Basic',
          },
        },
        repositoryConfigurations: {
          space: {
            fieldMappings: [
              {
                dataSourceFieldName: 'itemType',
                indexFieldName: '_category',
                indexFieldType: 'STRING',
              },
              {
                dataSourceFieldName: 'url',
                indexFieldName: '_source_uri',
                indexFieldType: 'STRING',
              },
            ],
          },
          page: {
            fieldMappings: [
              {
                dataSourceFieldName: 'itemType',
                indexFieldName: '_category',
                indexFieldType: 'STRING',
              },
              {
                dataSourceFieldName: 'url',
                indexFieldName: '_source_uri',
                indexFieldType: 'STRING',
              },
              {
                dataSourceFieldName: 'author',
                indexFieldName: '_authors',
                indexFieldType: 'STRING_LIST',
              },
              {
                dataSourceFieldName: 'createdDate',
                indexFieldName: '_created_at',
                dateFieldFormat: "yyyy-MM-dd'T'HH:mm:ss'Z'",
                indexFieldType: 'DATE',
              },
              {
                dataSourceFieldName: 'modifiedDate',
                indexFieldName: '_last_updated_at',
                dateFieldFormat: "yyyy-MM-dd'T'HH:mm:ss'Z'",
                indexFieldType: 'DATE',
              },
            ],
          },
        },
        type: 'CONFLUENCEV2',
        additionalProperties: {
          isCrawlPageComment: false,
          exclusionUrlPatterns: [],
          inclusionFileTypePatterns: [],
          isCrawlBlog: false,
          blogTitleRegEX: [],
          proxyPort: '',
          inclusionUrlPatterns: [],
          attachmentTitleRegEX: [],
          includeSupportedFileType: false,
          isCrawlPage: true,
          fieldForUserId: 'uuid',
          commentTitleRegEX: [],
          exclusionSpaceKeyFilter: [],
          isCrawlBlogAttachment: false,
          isCrawlPersonalSpace: false,
          exclusionFileTypePatterns: [],
          isCrawlPageAttachment: false,
          inclusionSpaceKeyFilter: [],
          maxFileSizeInMegaBytes: '50',
          proxyHost: '',
          isCrawlArchivedSpace: false,
          isCrawlArchivedPage: false,
          isCrawlAcl: true,
          pageTitleRegEX: [],
          isCrawlBlogComment: false,
        },
      },
      roleArn: confluenceDataSourceRole.roleArn,
    });
  }
}
