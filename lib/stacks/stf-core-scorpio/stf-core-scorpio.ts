import { Aws, CfnOutput, NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { Parameters } from "../../../parameters";
import { StfCoreApiGateway } from "../stf-core-constructs/apigateway";
import { StfCoreScorpioDatabase } from "./database";
import { StfCoreScorpioFargate } from "./fargate";
import { StfCoreScorpioKafka } from "./kafka";
import { StfCoreNetworking } from "../stf-core-constructs/networking";
import { StfCoreSecret } from "../stf-core-constructs/secret";

export class StfCoreScorpio extends NestedStack {
  public readonly dns_context_broker: string;
  public readonly vpc: Vpc;
  public readonly broker_api_endpoint: string;
  public readonly api_ref: string;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    const secret_construct = new StfCoreSecret(this, "SecretStack", {});

    const networking_construct = new StfCoreNetworking(
      this,
      "NetworkingStack",
      {}
    );

    const database_construct = new StfCoreScorpioDatabase(this, "DatabaseStack", {
      vpc: networking_construct.vpc,
      secret_arn: secret_construct.secret.secretArn,
    });

    const kafka_construct = new StfCoreScorpioKafka(this, "KafkaStack", {
      vpc: networking_construct.vpc,
    });

    const fargate_construct = new StfCoreScorpioFargate(
      this,
      "FargateStack",
      {
        vpc: networking_construct.vpc,
        sg_kafka: kafka_construct.sg_kafka,
        sg_database: database_construct.sg_database,
        secret_arn: secret_construct.secret.secretArn,
        db_endpoint: database_construct.database_endpoint,
        db_port: database_construct.database_port,
        kafka_brokers: kafka_construct.kafka_brokers,
        image_context_broker: Parameters.stf_scorpio.image_context_broker,
      }
    );
    fargate_construct.node.addDependency(kafka_construct)
    fargate_construct.node.addDependency(database_construct)
    fargate_construct.node.addDependency(networking_construct)
    fargate_construct.node.addDependency(secret_construct)

    const api_stack = new StfCoreApiGateway(this, "Api", {
      vpc: networking_construct.vpc,
      fargate_alb: fargate_construct.fargate_alb,
    });

    new CfnOutput(this, "stf_endpoint", {
      value: `https://${api_stack.api_ref}.execute-api.${Aws.REGION}.amazonaws.com`,
    });

    this.broker_api_endpoint = `https://${api_stack.api_ref}.execute-api.${Aws.REGION}.amazonaws.com`;
    this.dns_context_broker =
      fargate_construct.fargate_alb.loadBalancer.loadBalancerDnsName;
    this.vpc = networking_construct.vpc;
    this.api_ref = api_stack.api_ref;

    new CfnOutput(this, "fargate_alb", {
      value: fargate_construct.fargate_alb.loadBalancer.loadBalancerDnsName,
    });
  }
}