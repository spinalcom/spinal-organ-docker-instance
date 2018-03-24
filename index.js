const spinalcore = require('spinal-core-connectorjs'),
      DockerVolumeModel = require('../spinal-lib-docker-instance/model').DockerVolumeModel;

let fs = spinalcore.connect('http://168:JHGgcz45JKilmzknzelf65ddDadggftIO98P@' + process.env.SPINALHUB_IP + ':' + process.env.SPINALHUB_PORT);

const imageDir = 'SpinalSystems';

const imageName = 'demo_finewine:v0.0.1';

// this counter is for storing the number of images first run
let firstSetOfImages = 0;
// this flag is true when the first number of images had been procesed
let firstRun = false;

function loadModel() {

  spinalCore.load(fs, imageDir, function(images) {
    images.bind(function () {
      processAllFiles(images);
    });

  }, function () {

    setTimeout(loadModel, 5000);

  });
}

loadModel();


function processAllFiles(images) {

  for (var i=0; i < images.length; i++) {
    var im = images[i];

    im.load(function (dockerImage) {
      console.log(firstRun);
      console.log(dockerImage.processed.get());
      if (!firstRun || dockerImage.processed.get() == false) {
        dockerImage.processed.set(true);
        firstSetOfImages++;
        doProcess(dockerImage);
      }
      if (firstSetOfImages == images.length) {
        firstRun = true;
      }
    });

    
  }

}

/*
spinalcore.load(fs, imageDir + imageName,
  function (dockerInstance) {
    console.log('Using existing model');
    doProcess(dockerInstance);
  },
  function () {
    let dockerImage = new DockerImageModel('spinalcom/' + imageName);
    spinalCore.store(fs, dockerImage, imageDir + imageName, function () {
      //dockerInstance.addBackup();
      doProcess(dockerImage)
      console.log('Using new model');
    });
  }
);
*/

function doProcess(dockerInstance) {
/*
  dockerInstance.backups.bind(function () {
    for (let i=0; i < dockerInstance.backups.length; i++) {
      let b = dockerInstance.backups[i];

      let spinalHubPort = dockerInstance.port.get();
      let volumeName = 'spinalhub_memory_' + spinalHubPort;

      if (!b.completed.get()) {
        doBackup(volumeName, b, spinalHubPort);
      }
    }
  });

  dockerInstance.current.bind(function () {
    if (dockerInstance.current.has_been_modified() && dockerInstance.current.get() != dockerInstance.previous.get() && dockerInstance.current.get() != '') {
      let spinalHubPort = dockerInstance.port.get();
      let backupName = dockerInstance.current.get();
      let volumeName = 'spinalhub_memory_' + spinalHubPort;

      doRestore(volumeName, backupName, spinalHubPort);
    }
  });

  dockerInstance.toRemove.bind(function () {
    let vs = dockerInstance.toRemove.get();

    for (let i=0; i < vs.length; i++) {
      let v = vs[i];
      remove(v);
    }
  });
*/
  dockerInstance.volumes.bind(function () {

    let volumes = dockerInstance.volumes;
  
    for (let i=0; i < volumes.length; i++) {
      let v = volumes[i];
      if (v.status.has_been_modified()) {
        switch (v.status.get()) {
          case 0:
            doBackup(v, v.container.get(), v.src.get(), v.name.get());
            break;
          case 3:
            remove(volumes, i, v.name.get());
            break;
        }
      }
    }
  });

  dockerInstance.toCheck.bind(function () {

    let toCheck = dockerInstance.toCheck;

    for (let i=0; i < toCheck.length; i++) {
      checkContainer(toCheck[i], dockerInstance.containers);
      dockerInstance.checkedContainer(toCheck[i]);
    }

  });

  dockerInstance.containers.bind(function () {

    let containers = dockerInstance.containers;
  
    for (let i=0; i < containers.length; i++) {
      let c = containers[i];

      // check for volume restore
      if (c.restoreVolume.has_been_modified()) {
        let restoreVolume = c.restoreVolume.get();
        c.restoreVolume.set('');

        doRestore(c, c.volume.get(), restoreVolume);
      }

      // check for status
      if (c.status.has_been_modified()) {
        switch (c.status.get()) {
          case 0:
            newContainer(c, dockerInstance.name.get(), c.port, c.volume, c.restoreVolume);
            break;
          case 3:
            removeContainer(i, containers);
            break;
          case 5:
            startContainer(i, containers);
            break;
          case 6:
            stopContainer(i, containers);
            break;
        }
      }
    }
  });

}

const { exec } = require('child_process');
const path = require('path');

function doBackup(volume, container, src, target) {
  console.log('Sarting backup of ' + src + ' on ' + new Date());

  let cmd = 'docker stop ' + container + '; docker run --rm --name volumerize -v ' + src + ':/source:ro -v ' + target + ':/backup -e "VOLUMERIZE_SOURCE=/source" -e "VOLUMERIZE_TARGET=file:///backup" blacklabelops/volumerize backup; docker start ' + container;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`exec error: ${err}`);
      return;
    }
    volume.status.set(1);
    console.log(stdout);
  });

}

function doRestore(container, src, backup) {
  let c = container.name.get();
  console.log('Replacing volvume of ' + c + ' for ' + backup + ' on ' + new Date());

  let cmd = 'docker stop ' + c + '; docker run --rm --name volumerize -v ' + src + ':/source -v ' + backup + ':/backup:ro -e "VOLUMERIZE_SOURCE=/source" -e "VOLUMERIZE_TARGET=file:///backup" blacklabelops/volumerize restore; docker start ' + c;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`exec error: ${err}`);
      return;
    }
    container.lastVolume.set(backup);
    console.log(stdout);
  });
}

function remove(volumes, i, volumeName) {
  console.log('Removing ' + volumeName + ' on ' + new Date());

  let cmd = 'docker volume rm ' + volumeName;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`exec error: ${err}`);
      volumes[i].status.set(4);
      return;
    }

    volumes.splice(i, 1);
    console.log(stdout);
  });
}

// TODO: don't do run if it exists already (do start)
// TODO: add button to check the status of the system (not now, in the future)
// Test everything, do doc and upload

function newContainer(container, imageName, port, volumeName, restoreVolume = '') {
  console.log('Sarting container of ' + imageName + ' at ' + port + ' on ' + new Date());

  let srcVol = 'source=' + volumeName + ',';

  let cmd = 'docker run --name=' + container.name.get() + ' --mount ' + srcVol + 'target=/usr/src/app/nerve-center/memory -p ' + port + ':8888 ' + imageName + ' &';

  console.log(cmd);

  
  if (restoreVolume != '')
    setTimeout(function () {
      if (container.status.get() != 4) {
        container.status.set(1);
        doRestore(container, volumeName, restoreVolume)
      }
    }, 5000);

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      container.status.set(4);
      console.error(`exec error: ${err}`);
      return;
    }
    
  });

}

function removeContainer(i, containers) {
  let c = containers[i];
  console.log('Removing container ' + c.name.get() + ' on ' + new Date());

  let cmd = 'docker container stop ' + c.name.get() + ' && docker container rm ' + c.name.get();

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      c.status.set(4);
      console.error(`exec error: ${err}`);
      return;
    }
    containers.splice(i, 1);
    console.log(stdout);
  });

}

function startContainer(i, containers) {
  let c = containers[i];

  console.log('Starting container ' + c.name.get() + ' on ' + new Date());

  let cmd = 'docker container start ' + c.name.get();

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      c.status.set(4);
      console.error(`exec error: ${err}`);
      return;
    }
    c.status.set(1);
  });

}

function stopContainer(i, containers) {
  let c = containers[i];
  console.log('Stopping container ' + c.name.get() + ' on ' + new Date());

  let cmd = 'docker container stop ' + c.name.get();

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      c.status.set(4);
      console.error(`exec error: ${err}`);
      return;
    }
    c.status.set(2);
  });

}

function checkContainer(i, containers) {
  let c = containers[i];
  console.log('Checking container ' + c.name.get() + ' on ' + new Date());

  let cmd = 'docker container ps | grep ' + c.name.get();

  exec(cmd, (err, stdout, stderr) => {

    if (stdout.length > 0)
      c.status.set(1);
    else
      c.status.set(2);
  });

}
