var AWS = require('aws-sdk');
var http = require('http');
var request = require('request');
var async = require('async');

exports.handler = function(event, context, callback) {
    var codedeploy = new AWS.CodeDeploy({apiVersion: '2014-10-06'});

    // Retrieve the Deployment ID from the Lambda action
    var deploymentId = event.DeploymentId;

    // Retrieve the Lifecycle hook event 
    var lifecycleEventHookExecutionId = event.LifecycleEventHookExecutionId;

    // Retrieve the Regulators endpoint from the lambda environment variable.
    var url = process.env.REGULATORS_ENDPOINT;

    // Build the regulators JSON input object.
    var regulators = {} // empty Object
    var key = 'regulators';
    regulators[key] = []; // empty Array, which you can push() values into
    var context = {
        lock_key: 'regulators-lambda-lock-for-codedeploy'
    };

    var regulator = {
        name: 'regulators-acquire-lock',
        context: context
    };
    regulators[key].push(regulator);

    var regulators_json = JSON.stringify(regulators);
    console.log('regulators: ', regulators_json);
    console.log('url: ', url);

    InvokeRegulator(url, regulators_json, function(err, workflowId) {
        console.log("Regulators workflow ID: " + workflowId);
  
        var result;
        async.doUntil(function(callback) {
          GetRegulatorWorkflowStatus(url, workflowId, (err, status) => {
            console.log("Workflow status: " + status);
            result = status;
            if (!isFinal(status)) {
              setTimeout(() => {
                callback();
              }, 1000);
            } else {
              callback();
            }
          });
        }, function (callback) {
          console.log("Checking status: " + result);
          return callback(null, isFinal(result));
        }, (err) => {
          if (err) return putJobFailure(err);
          if (result == "Succeeded") {
            console.log('All regulators succeeded');  
            return putLambdaHookSuccess("All regulators succeeded.");
          } else {
            console.log('Regulator failed'); 
            return putLambdaHookFailure("Regulator failed.");
          }
  
        });
    });

    // Notify AWS CodeDeploy of a successful hook
    var putLambdaHookSuccess = function(message) {
        var params = {
            deploymentId: deploymentId,
            lifecycleEventHookExecutionId: lifecycleEventHookExecutionId,
            status: 'Succeeded'
        };
        console.log('Sending success to CodeDeploy'); 
        codedeploy.putLifecycleEventHookExecutionStatus(params, function(err, data) {
            if(err) {
                console.log('Error sending status to CodeDeploy: ', err);
                callback('Something went wrong');
            } else {
                console.log('Status successfully sent to CodeDeploy: ', err);
                callback(null, 'Invocation succeeded');
            }
        });
    };

    // Notify AWS CodeDeploy of a failed hook
    var putLambdaHookFailure = function(message) {
        var params = {
            deploymentId: deploymentId,
            lifecycleEventHookExecutionId: lifecycleEventHookExecutionId,
            status: 'Failed'
        };
        console.log('Sending failure to CodeDeploy');  
        codedeploy.putLifecycleEventHookExecutionStatus(params, function(err, data) {
            console.log('Error sending status to CodeDeploy: ', err);
            callback('Something went wrong');
        });
    };
};

function isFinal(result) {
    return result === "Succeeded" || result === "Failed";
}

function InvokeRegulator(url, json, callback) {
    url = url + "/regulate";
    request.post({
        headers: {'content-type': 'application/json'},
        url: url,
        body: json
    }, (error, res, body) => {
        if (error) {
        console.log(error);
        return;
        }
        console.log("InvokeRegulator response body: " + body)
        callback(null, JSON.parse(body).id);
    });
}

function GetRegulatorWorkflowStatus(url, workflowId, callback) {
    url = url + "/workflows/" + workflowId
    request({
        headers: {'content-type': 'application/json'},
        url: url,
        body: JSON.stringify({json: true})
    }, (err, res, body) => {
        if (err) {
        console.log(err);
        return callback(err);
        }
        console.log("GetWorkflowStatus respose body: " + body);
        callback(null, JSON.parse(body).status);
    });
}

